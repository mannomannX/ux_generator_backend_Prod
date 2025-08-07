// ==========================================
// SERVICES/API-GATEWAY/src/middleware/cors.js
// ==========================================

const allowedOrigins = [
  'http://localhost:3000',  // React dev server
  'http://localhost:3001',  // Alternative dev port
  'http://localhost:5173',  // Vite dev server
  'https://localhost:3000', // HTTPS dev
  'https://localhost:5173', // HTTPS Vite
];

// Add production origins from environment
if (process.env.ALLOWED_ORIGINS) {
  const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  allowedOrigins.push(...envOrigins);
}

export const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // SECURITY FIX: Stricter origin validation in development
    if (process.env.NODE_ENV === 'development') {
      // Define allowed development origins more strictly
      const allowedDevOrigins = [
        'http://localhost:3000',
        'http://localhost:3001', 
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:5173',
        'https://localhost:3000',
        'https://localhost:5173',
        'https://127.0.0.1:3000',
        'https://127.0.0.1:5173'
      ];
      
      if (allowedDevOrigins.includes(origin)) {
        return callback(null, true);
      }
    }
    
    // Check against allowed origins list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Reject origin
    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  
  methods: [
    'GET',
    'POST', 
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ],
  
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Correlation-ID',
    'Accept',
    'Origin'
  ],
  
  exposedHeaders: [
    'X-Correlation-ID',
    'X-Total-Count',
    'X-Page-Count'
  ],
  
  credentials: true,
  
  // Preflight cache time (in seconds)
  maxAge: 86400, // 24 hours
  
  // Success status for OPTIONS requests
  optionsSuccessStatus: 204,
  
  // Enable CORS preflight for all routes
  preflightContinue: false,
};