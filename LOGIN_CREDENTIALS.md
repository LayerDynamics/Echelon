# Default Login Credentials

## Admin Account

When you start Echelon for the first time, a default admin account is automatically created.

### Credentials

```
Email:    admin@echelon.local
Password: admin123
```

### Login URLs

- **Web UI**: http://localhost:9090/auth/login
- **Dashboard**: http://localhost:9090/dashboard

### API Login

```bash
curl -X POST http://localhost:9090/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@echelon.local",
    "password": "admin123"
  }'
```

## ⚠️ IMPORTANT SECURITY NOTICE

**CHANGE THE DEFAULT PASSWORD IMMEDIATELY IN PRODUCTION!**

This default account is created automatically for development convenience. For production deployments:

1. Change the default admin password immediately after first login
2. Or disable automatic seeding by removing the seed call from `main.ts`
3. Create production admin accounts manually with strong passwords

## Creating Additional Users

### Via Web UI

1. Go to http://localhost:9090/auth/register
2. Fill in the registration form
3. Choose role: `owner`, `admin`, `member`, or `guest`

### Via API

```bash
curl -X POST http://localhost:9090/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "New User",
    "password": "securepassword123",
    "role": "member"
  }'
```

## User Roles

- **owner** - Highest privilege level, full system access
- **admin** - Administrative access, can manage users
- **member** - Standard user access (default for new registrations)
- **guest** - Limited access

## WASM Demo Routes (No Auth Required)

The WASM demonstration endpoints don't require authentication:

```bash
# View WASM API documentation
curl http://localhost:9090/api/wasm/demo

# Test basic WASM execution
curl http://localhost:9090/api/wasm/demo/basic

# Get runtime metrics
curl http://localhost:9090/api/wasm/demo/metrics
```

## Disabling Auto-Seed

To disable automatic admin user creation, edit `main.ts` and remove or comment out:

```typescript
// 4. Seed database with default data (admin user)
const { seedDatabase } = await import('@/contexts/iam/infrastructure/seed.ts');
await seedDatabase();
```

## Manual Seeding

You can also run the seed script manually:

```bash
deno run --allow-all src/contexts/iam/infrastructure/seed.ts
```
