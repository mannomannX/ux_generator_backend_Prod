// ==========================================
// BILLING SERVICE - Payment Methods Routes
// ==========================================

import express from 'express';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/error-handler.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateObjectId } from '../utils/validation.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Get user's payment methods
router.get('/', asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const db = req.app.locals.mongoClient.getDb();
  const paymentMethodsCollection = db.collection('payment_methods');

  const paymentMethods = await paymentMethodsCollection
    .find({ 
      userId: userId.toString(),
      deleted: { $ne: true }
    })
    .sort({ isDefault: -1, createdAt: -1 })
    .toArray();

  // Remove sensitive data
  const sanitizedMethods = paymentMethods.map(method => ({
    id: method._id,
    type: method.type,
    last4: method.last4,
    brand: method.brand,
    expiryMonth: method.expiryMonth,
    expiryYear: method.expiryYear,
    isDefault: method.isDefault,
    createdAt: method.createdAt,
    stripePaymentMethodId: method.stripePaymentMethodId
  }));

  res.json({
    paymentMethods: sanitizedMethods,
    total: sanitizedMethods.length
  });
}));

// Add new payment method
router.post('/', asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { stripePaymentMethodId, setAsDefault = false } = req.body;

  if (!stripePaymentMethodId) {
    throw new ValidationError('Stripe payment method ID is required');
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  
  // Get payment method details from Stripe
  const stripePaymentMethod = await stripe.paymentMethods.retrieve(stripePaymentMethodId);
  
  if (stripePaymentMethod.customer !== req.user.stripeCustomerId) {
    throw new ValidationError('Payment method does not belong to this customer');
  }

  const db = req.app.locals.mongoClient.getDb();
  const paymentMethodsCollection = db.collection('payment_methods');

  // If setting as default, unset other defaults
  if (setAsDefault) {
    await paymentMethodsCollection.updateMany(
      { userId: userId.toString() },
      { $set: { isDefault: false, updatedAt: new Date() } }
    );
  }

  const paymentMethod = {
    userId: userId.toString(),
    stripePaymentMethodId,
    type: stripePaymentMethod.type,
    last4: stripePaymentMethod.card?.last4 || null,
    brand: stripePaymentMethod.card?.brand || null,
    expiryMonth: stripePaymentMethod.card?.exp_month || null,
    expiryYear: stripePaymentMethod.card?.exp_year || null,
    isDefault: setAsDefault,
    createdAt: new Date(),
    updatedAt: new Date(),
    deleted: false
  };

  const result = await paymentMethodsCollection.insertOne(paymentMethod);

  res.status(201).json({
    message: 'Payment method added successfully',
    paymentMethod: {
      id: result.insertedId,
      type: paymentMethod.type,
      last4: paymentMethod.last4,
      brand: paymentMethod.brand,
      expiryMonth: paymentMethod.expiryMonth,
      expiryYear: paymentMethod.expiryYear,
      isDefault: paymentMethod.isDefault,
      createdAt: paymentMethod.createdAt
    }
  });
}));

// Set payment method as default
router.patch('/:paymentMethodId/default', asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { paymentMethodId } = req.params;

  const paymentMethodObjectId = validateObjectId(paymentMethodId, 'Payment Method ID');

  const db = req.app.locals.mongoClient.getDb();
  const paymentMethodsCollection = db.collection('payment_methods');

  // Verify payment method belongs to user
  const paymentMethod = await paymentMethodsCollection.findOne({
    _id: paymentMethodObjectId,
    userId: userId.toString(),
    deleted: { $ne: true }
  });

  if (!paymentMethod) {
    throw new NotFoundError('Payment method');
  }

  // Unset all defaults for this user
  await paymentMethodsCollection.updateMany(
    { userId: userId.toString() },
    { $set: { isDefault: false, updatedAt: new Date() } }
  );

  // Set this one as default
  await paymentMethodsCollection.updateOne(
    { _id: paymentMethodObjectId },
    { $set: { isDefault: true, updatedAt: new Date() } }
  );

  req.app.locals.logger?.info('Payment method set as default', {
    userId,
    paymentMethodId,
    correlationId: req.correlationId
  });

  res.json({
    message: 'Payment method set as default successfully'
  });
}));

// Delete payment method
router.delete('/:paymentMethodId', asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { paymentMethodId } = req.params;

  const paymentMethodObjectId = validateObjectId(paymentMethodId, 'Payment Method ID');

  const db = req.app.locals.mongoClient.getDb();
  const paymentMethodsCollection = db.collection('payment_methods');

  // Verify payment method belongs to user
  const paymentMethod = await paymentMethodsCollection.findOne({
    _id: paymentMethodObjectId,
    userId: userId.toString(),
    deleted: { $ne: true }
  });

  if (!paymentMethod) {
    throw new NotFoundError('Payment method');
  }

  // Soft delete the payment method
  await paymentMethodsCollection.updateOne(
    { _id: paymentMethodObjectId },
    { 
      $set: { 
        deleted: true,
        deletedAt: new Date(),
        updatedAt: new Date()
      } 
    }
  );

  // If this was the default, we might want to set another as default
  if (paymentMethod.isDefault) {
    const otherMethod = await paymentMethodsCollection.findOne({
      userId: userId.toString(),
      deleted: { $ne: true },
      _id: { $ne: paymentMethodObjectId }
    }, { sort: { createdAt: -1 } });

    if (otherMethod) {
      await paymentMethodsCollection.updateOne(
        { _id: otherMethod._id },
        { $set: { isDefault: true, updatedAt: new Date() } }
      );
    }
  }

  // Also detach from Stripe customer (optional)
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
  } catch (error) {
    req.app.locals.logger?.warn('Failed to detach payment method from Stripe', {
      error: error.message,
      stripePaymentMethodId: paymentMethod.stripePaymentMethodId,
      correlationId: req.correlationId
    });
  }

  req.app.locals.logger?.info('Payment method deleted', {
    userId,
    paymentMethodId,
    correlationId: req.correlationId
  });

  res.json({
    message: 'Payment method deleted successfully'
  });
}));

// Get payment method details
router.get('/:paymentMethodId', asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { paymentMethodId } = req.params;

  const paymentMethodObjectId = validateObjectId(paymentMethodId, 'Payment Method ID');

  const db = req.app.locals.mongoClient.getDb();
  const paymentMethodsCollection = db.collection('payment_methods');

  const paymentMethod = await paymentMethodsCollection.findOne({
    _id: paymentMethodObjectId,
    userId: userId.toString(),
    deleted: { $ne: true }
  });

  if (!paymentMethod) {
    throw new NotFoundError('Payment method');
  }

  res.json({
    paymentMethod: {
      id: paymentMethod._id,
      type: paymentMethod.type,
      last4: paymentMethod.last4,
      brand: paymentMethod.brand,
      expiryMonth: paymentMethod.expiryMonth,
      expiryYear: paymentMethod.expiryYear,
      isDefault: paymentMethod.isDefault,
      createdAt: paymentMethod.createdAt,
      updatedAt: paymentMethod.updatedAt
    }
  });
}));

export default router;