# BidForGood

A charity auction web application where users can bid on donated items, services, or experiences, with proceeds going to verified charity organisations. The platform combines online auction features with charity fundraising.

## Project Description

BidForGood is a secure, interactive charity auction platform that makes fundraising more transparent, accessible, and engaging. Users can browse charity campaigns, view detailed auction listings, place real-time bids, set automated bids, track saved items, and receive notifications. After successful auctions, winners receive digital donation receipts showing their contribution details.

## Features

- User registration and profile management
- Charity campaign pages
- Detailed auction listings
- Real-time bidding
- Automated bidding
- Payment and donation receipt generation
- Search and filtering
- Watchlist
- Notifications
- Donor dashboard
- Admin dashboard
- Audit logging (bids, payments, receipts)

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Frontend | React, TypeScript, Tailwind CSS, DaisyUI, Socket.IO Client |
| Backend | Node.js, Express.js, TypeScript, Socket.IO Server |
| Database | PostgreSQL, node-postgres (pg) |
| Authentication | JWT, argon2 (password hashing) |
| Security | express-rate-limit, express-session, validator |
| File Upload | multer |
| Logging | morgan |
| Testing | Jest, OWASP ZAP |
| Deployment | GitHub Actions, Docker, nginx |

## Project Structure

```
BidForGood/
├── frontend/          # React frontend application
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── styles/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/           # Node.js backend API
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── models/
│   │   ├── utils/
│   │   └── types/
│   ├── package.json
│   └── tsconfig.json
│
├── docker/            # Docker configuration files
├── docs/              # Documentation
└── README.md
```

## Getting Started

### Prerequisites

Before you begin, ensure you have installed:

- Node.js (v18 or higher)
- npm or yarn
- PostgreSQL (v14 or higher)
- Docker (optional, for containerized setup)
- Git

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd ICT2216-P1-Group2-Bidding-Charity-Website
```

2. Install all dependencies:

```bash
npm run install:all
```

Or manually:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### Environment Configuration

1. Backend environment:

```bash
cd backend
cp .env.example .env
```

2. Frontend environment:

```bash
cd frontend
cp .env.example .env
```

Update the `.env` files with your local configuration. Refer to `.env.example` for the required variables.

### Running the Application

From the root directory, run:

```bash
npm run dev
```

This will start both the backend (http://localhost:5000) and frontend (http://localhost:5173) simultaneously.

To run only the backend:

```bash
npm run dev:backend
```

To run only the frontend:

```bash
npm run dev:frontend
```

### Docker Setup (Optional)

```bash
# Build and run all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## License

This project is for educational purposes as part of ICT2216.