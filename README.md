# playball.exe

A web-based baseball management game built with Next.js, Prisma, and PostgreSQL.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [Docker](https://www.docker.com/) (for PostgreSQL)

## Getting Started

### 1. Start the database

```bash
docker compose up -d
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and replace the `NEXTAUTH_SECRET` value with a generated secret:

```bash
openssl rand -base64 32
```

### 3. Install dependencies and generate Prisma client

```bash
npm install
```

(`prisma generate` runs automatically via the `postinstall` script.)

### 4. Run database migrations

```bash
npx prisma migrate dev
```

### 5. (Optional) Seed the database

```bash
npx prisma db seed
```

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- [Next.js](https://nextjs.org/) — React framework
- [NextAuth.js](https://next-auth.js.org/) — Authentication
- [Prisma](https://www.prisma.io/) — ORM
- [PostgreSQL](https://www.postgresql.org/) — Database
- [Tailwind CSS](https://tailwindcss.com/) — Styling
