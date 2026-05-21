# CodeForge

A production-ready multi-language online compiler with Docker sandboxed execution, built with Next.js, Express, and Neon PostgreSQL.

![CodeForge](https://img.shields.io/badge/CodeForge-v1.0.0-6366f1)

## Features

- **8 Languages**: Python, C, C++, JavaScript, PHP, Java, Assembly (NASM), and Binary mode
- **Docker Sandboxed**: Every execution runs in an isolated container with strict resource limits
- **Secure**: Network isolation (`--network none`), non-root user, timeouts enforced
- **VS Code-style Editor**: Monaco Editor with syntax highlighting, auto-completion, and themes
- **Binary Mode**: Convert binary strings to decimal, hex, octal, and ASCII
- **Assembly Mode**: Write and run NASM x86-64 assembly code
- **Responsive UI**: Works on desktop and mobile with dark SaaS design
- **Persistent Storage**: Neon PostgreSQL for execution logs and snippets
- **Docker Compose**: One-command deployment

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Frontend    │────▶│  Backend    │────▶│  Docker Sandbox  │
│  Next.js     │     │  Express    │     │  (Isolated per   │
│  Monaco      │◀────│  API        │◀────│   execution)     │
│  Tailwind    │     │             │     │                  │
└─────────────┘     └──────┬──────┘     └──────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Neon        │
                    │  PostgreSQL  │
                    └──────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, Monaco Editor, Framer Motion |
| Backend | Node.js, Express, TypeScript, Dockerode |
| Database | Neon PostgreSQL (serverless) |
| Execution | Docker with resource limits, Network isolation |
| Languages | Python 3, GCC 13, G++ 13, Node.js 20, PHP 8.3, OpenJDK 21, NASM |

## Getting Started

### Prerequisites

- Node.js 18+
- Docker
- npm or yarn
- A Neon PostgreSQL database (or any PostgreSQL)

### Local Development

1. **Clone and install dependencies**

```bash
git clone <repo-url> codeforge
cd codeforge

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

2. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your Neon PostgreSQL connection string
```

3. **Build the execution Docker image**

```bash
docker build -t codeforge-executor:latest ./execution
```

4. **Run the backend**

```bash
cd backend
npm run dev
```

5. **Run the frontend** (in a separate terminal)

```bash
cd frontend
npm run dev
```

6. Open http://localhost:3000

### Docker Compose Deployment

```bash
# Build and start all services
docker compose build --no-cache
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## API Reference

### POST /api/execute

Execute code in a sandboxed Docker container.

**Request Body:**

```json
{
  "language": "python",
  "code": "print('Hello World')",
  "input": "optional input"
}
```

**Response:**

```json
{
  "output": "Hello World\n",
  "error": "",
  "exitCode": 0,
  "executionTimeMs": 45,
  "timedOut": false,
  "memoryUsedKb": 8192,
  "cpuTimeMs": 42
}
```

### GET /api/languages

Returns list of supported languages.

### POST /api/binary

Convert a binary string to decimal, hex, octal, and ASCII.

**Request Body:**

```json
{
  "binary": "01001000 01101001"
}
```

### GET /api/health

Health check endpoint.

## Execution Security

Each code execution is sandboxed with:

| Restriction | Value |
|-------------|-------|
| Network | Blocked (`--network none`) |
| User | Non-root (UID 1000) |
| Memory | Configurable (default 256MB) |
| CPU | Configurable (default 1 vCPU) |
| Timeout | Configurable (default 10s) |
| Output Limit | Configurable (default 64KB) |
| File System | Read-only root, temp bind mount |
| Process Limit | Max 50 PID |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | Neon PostgreSQL connection string |
| `EXECUTION_TIMEOUT` | 10 | Max execution time in seconds |
| `EXECUTION_MEMORY_LIMIT` | 256 | Memory limit in MB |
| `EXECUTION_CPU_LIMIT` | 1 | CPU cores limit |
| `EXECUTION_OUTPUT_LIMIT` | 65536 | Max output size in bytes |
| `EXECUTION_MAX_FILE_SIZE` | 65536 | Max code size in bytes |
| `CORS_ORIGIN` | http://localhost:3000 | Allowed CORS origin |
| `PORT` | 4000 | Backend port |
| `NEXT_PUBLIC_API_URL` | http://localhost:4000 | API URL for frontend |

## Project Structure

```
codeforge/
├── frontend/                # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx     # Landing page
│   │   │   ├── layout.tsx   # Root layout
│   │   │   ├── globals.css  # Global styles
│   │   │   └── compiler/
│   │   │       └── page.tsx # Compiler page
│   │   ├── components/
│   │   │   ├── Editor.tsx          # Monaco Editor wrapper
│   │   │   ├── OutputPanel.tsx     # Output/terminal display
│   │   │   ├── InputPanel.tsx      # Custom input panel
│   │   │   ├── LanguageSelector.tsx
│   │   │   ├── BinaryMode.tsx      # Binary converter
│   │   │   ├── AssemblyMode.tsx    # Assembly templates
│   │   │   ├── Navbar.tsx
│   │   │   └── Footer.tsx
│   │   └── lib/
│   │       ├── api.ts        # API client
│   │       ├── types.ts      # TypeScript types
│   │       └── templates.ts  # Code templates
│   ├── next.config.js
│   └── tailwind.config.ts
├── backend/                 # Express API
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── routes/
│   │   │   └── execute.ts   # Execute, languages, binary endpoints
│   │   ├── services/
│   │   │   └── docker.ts    # Docker sandbox executor
│   │   ├── db/
│   │   │   ├── index.ts     # Database connection & queries
│   │   │   └── schema.ts    # SQL schema
│   │   ├── middleware/
│   │   │   ├── rateLimit.ts
│   │   │   └── errorHandler.ts
│   │   └── config/
│   │       └── index.ts
│   └── Dockerfile
├── execution/
│   └── Dockerfile           # Multi-language execution image
├── docker-compose.yml
└── .env.example
```

## License

MIT
