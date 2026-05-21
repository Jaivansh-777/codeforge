import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL || '',
  },
  execution: {
    timeout: parseInt(process.env.EXECUTION_TIMEOUT || '10', 10),
    memoryLimit: parseInt(process.env.EXECUTION_MEMORY_LIMIT || '256', 10),
    cpuLimit: parseInt(process.env.EXECUTION_CPU_LIMIT || '1', 10),
    outputLimit: parseInt(process.env.EXECUTION_OUTPUT_LIMIT || '65536', 10),
    maxFileSize: parseInt(process.env.EXECUTION_MAX_FILE_SIZE || '65536', 10),
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
};
