# 🛒 TaskStore — Minimal E-Commerce App

A clean, full-stack e-commerce application built with **Node.js**, **Express**, **EJS**, and **SQLite**. Includes user authentication, a session-based shopping cart, product listings, and order processing — all served from a single monolithic Express server.

---

## 📸 Features

| Feature | Details |
|---|---|
| 🏠 **Product Listings** | Browse all products on the home page |
| 🔍 **Product Detail Page** | View full description, price, and add to cart |
| 🛒 **Shopping Cart** | Session-based cart with quantity support |
| 🔐 **User Registration & Login** | Secure auth with bcrypt-hashed passwords |
| 📦 **Order Processing** | Checkout form, orders saved to SQLite database |
| 🧹 **Protected Routes** | Checkout requires authentication |
| 🛡️ **Security** | Helmet HTTP headers, httpOnly cookies, session regeneration |

---

## 🗂️ Project Structure

```
taskapp/
├── server.js              # Main Express app — routes, middleware, server startup
├── db.js                  # SQLite database setup and product seeding
├── .env                   # Local environment variables (not committed to git)
├── .env.example           # Template for environment variables
├── .gitignore             # Files excluded from version control
├── package.json           # Dependencies and npm scripts
│
├── views/                 # EJS templates (rendered server-side)
│   ├── index.ejs          # Home page — product listings
│   ├── product.ejs        # Single product detail page
│   ├── cart.ejs           # Shopping cart & checkout
│   ├── checkout_success.ejs # Order confirmation page
│   ├── login.ejs          # Login page
│   ├── register.ejs       # Registration page
│   └── partials/
│       ├── header.ejs     # Shared HTML head, navbar
│       └── footer.ejs     # Shared footer
│
└── public/                # Static assets served directly
    ├── css/
    │   └── style.css      # All styling (vanilla CSS)
    └── images/            # Product images
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/taskstore.git
cd taskstore
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-long-random-secret-string-here
DB_PATH=./database.sqlite
```

> **Important**: Change `SESSION_SECRET` to a long, random, unguessable string before deploying.

### 4. Run the App

**Development** (with auto-restart via nodemon):
```bash
npm run dev
```

**Production**:
```bash
npm start
```

The server will start at `http://localhost:3000`.  
On first run, the SQLite database is created automatically and seeded with 4 sample products.

---

## 🔌 API & Routes Reference

### Page Routes (renders HTML)

| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/` | Home page — product listings | No |
| `GET` | `/product/:id` | Product detail page | No |
| `GET` | `/cart` | Shopping cart page | No |
| `GET` | `/register` | Registration form | No |
| `GET` | `/login` | Login form | No |
| `GET` | `/logout` | Destroys session, redirects to `/` | No |

### Action Routes (process forms)

| Method | Path | Description | Auth Required |
|---|---|---|---|
| `POST` | `/register` | Create a new user account | No |
| `POST` | `/login` | Authenticate a user | No |
| `POST` | `/cart/add/:id` | Add a product to cart | No |
| `POST` | `/checkout` | Place an order, save to DB | **Yes** |

---

## 🗄️ Database Schema

The app uses a single **SQLite** file (`database.sqlite`). Tables are created automatically on startup.

```sql
-- Registered users
CREATE TABLE users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email    TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL          -- bcrypt hash (12 rounds)
);

-- Product catalogue
CREATE TABLE products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL,
    price       REAL    NOT NULL,
    image       TEXT    NOT NULL    -- path under /public
);

-- Customer orders
CREATE TABLE orders (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date    TEXT    NOT NULL,       -- ISO 8601 timestamp
    items   TEXT    NOT NULL,       -- JSON array of {productId, quantity}
    total   REAL    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## ☁️ Deployment Guide

### Option A — Railway (Recommended, Free Tier)

1. Push your code to a GitHub repository.
2. Go to [railway.app](https://railway.app) and create a new project from your repo.
3. Set the following environment variables in the Railway dashboard:
   - `NODE_ENV=production`
   - `SESSION_SECRET=<your-long-secret>`
   - `PORT=3000`
   - `DB_PATH=./database.sqlite`
4. Railway will automatically run `npm start`.

> **Note**: Since SQLite is a file-based database, it will be reset on every new Railway deployment. For persistent data in production, consider upgrading to a hosted PostgreSQL database using the [`pg`](https://www.npmjs.com/package/pg) package.

### Option B — Render

1. Create a new **Web Service** on [render.com](https://render.com) from your GitHub repo.
2. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Add environment variables in the Render dashboard (same as above).

### Option C — VPS / Self-Hosted (e.g., Ubuntu on DigitalOcean)

```bash
# 1. SSH into your server
ssh user@your-server-ip

# 2. Install Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20

# 3. Clone and set up the app
git clone https://github.com/your-username/taskstore.git
cd taskstore
npm install

# 4. Create your .env file
nano .env

# 5. Use PM2 to keep the app running
npm install -g pm2
pm2 start server.js --name taskstore
pm2 save
pm2 startup
```

Use **Nginx** as a reverse proxy to forward port 80/443 to your Express app on port 3000.

---

## 🔒 Security Notes

| Concern | How it's handled |
|---|---|
| Password storage | Hashed with `bcrypt` (12 rounds) |
| Session hijacking | `httpOnly` cookies, session regenerated on login |
| XSS | Helmet Content-Security-Policy headers |
| Clickjacking | Helmet `X-Frame-Options` header |
| HTTPS cookies | `secure: true` automatically enabled when `NODE_ENV=production` |
| SQL Injection | All queries use parameterized statements (`?` placeholders) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (v18+) |
| Web Framework | Express.js |
| Templating | EJS (Embedded JavaScript) |
| Database | SQLite via `sqlite3` + `sqlite` |
| Authentication | `bcrypt` + `express-session` |
| Security Headers | `helmet` |
| Environment Config | `dotenv` |
| Dev Server | `nodemon` |
| Styling | Vanilla CSS (Inter font from Google Fonts) |

---

## 📄 License

MIT © 2024 TaskStore
