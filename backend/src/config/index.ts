import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  execution: {
    timeout: parseInt(process.env.EXECUTION_TIMEOUT || '10', 10),
    outputLimit: parseInt(process.env.EXECUTION_OUTPUT_LIMIT || '65536', 10),
    maxFileSize: parseInt(process.env.EXECUTION_MAX_FILE_SIZE || '65536', 10),
    memoryLimit: parseInt(process.env.EXECUTION_MEMORY_LIMIT || '256', 10),
    cpuLimit: parseInt(process.env.EXECUTION_CPU_LIMIT || '1', 10),
  },
  pool: {
    sizePerLang: parseInt(process.env.POOL_SIZE_PER_LANG || '3', 10),
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,https://codeforge-lp2b.onrender.com').split(',').map(s => s.trim()),
  },
};
