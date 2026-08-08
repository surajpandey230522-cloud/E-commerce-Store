require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const bcrypt = require('bcrypt');
const { setupDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Setup database
let db;
setupDatabase().then(database => {
    db = database;
    console.log("Database initialized.");
}).catch(err => {
    console.error("Failed to setup database:", err);
    process.exit(1);
});

// --- Security Middleware ---
// Helmet sets sensible HTTP security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
        }
    }
}));

// --- Core Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Session Middleware ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,   // HTTPS-only cookies in production
        httpOnly: true,         // Prevent XSS access to session cookie
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// --- View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Global Locals Middleware ---
// Makes cart count and current user available to all EJS templates
app.use((req, res, next) => {
    if (!req.session.cart) req.session.cart = [];
    res.locals.cartItemCount = req.session.cart.reduce((total, item) => total + item.quantity, 0);
    res.locals.user = req.session.user || null;
    next();
});

// --- Auth Guard ---
const requireAuth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};


// =====================
//   AUTH ROUTES
// =====================

// GET /register
app.get('/register', (req, res) => {
    res.render('register', { title: "Register - E-Commerce" });
});

// POST /register
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.render('register', { title: "Register - E-Commerce", error: "All fields are required." });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 12);
        await db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
        res.redirect('/login');
    } catch (error) {
        res.render('register', { title: "Register - E-Commerce", error: "Username or email already exists." });
    }
});

// GET /login
app.get('/login', (req, res) => {
    res.render('login', { title: "Login - E-Commerce" });
});

// POST /login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.render('login', { title: "Login - E-Commerce", error: "Username and password are required." });
    }
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.regenerate((err) => {
            if (err) return res.redirect('/login');
            req.session.user = { id: user.id, username: user.username, email: user.email };
            req.session.cart = [];
            res.redirect('/');
        });
    } else {
        res.render('login', { title: "Login - E-Commerce", error: "Invalid username or password." });
    }
});

// GET /logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});


// =====================
//   E-COMMERCE ROUTES
// =====================

// GET / — Product listing
app.get('/', async (req, res) => {
    try {
        const products = await db.all('SELECT * FROM products');
        res.render('index', { products, title: "Home - TaskStore" });
    } catch (err) {
        res.status(500).send('Error loading products.');
    }
});

// GET /product/:id — Product details
app.get('/product/:id', async (req, res) => {
    try {
        const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (!product) return res.status(404).render('404', { title: "Not Found - E-Commerce" });
        res.render('product', { product, title: `${product.name} - E-Commerce` });
    } catch (err) {
        res.status(500).send('Error loading product.');
    }
});

// GET /cart — Shopping cart
app.get('/cart', async (req, res) => {
    try {
        const cartItems = req.session.cart || [];
        let populatedCart = [];
        let total = 0;
        for (let item of cartItems) {
            const product = await db.get('SELECT * FROM products WHERE id = ?', [item.productId]);
            if (product) {
                populatedCart.push({ ...product, quantity: item.quantity });
                total += product.price * item.quantity;
            }
        }
        res.render('cart', { cartItems: populatedCart, total, title: "Shopping Cart - E-Commerce" });
    } catch (err) {
        res.status(500).send('Error loading cart.');
    }
});

// POST /cart/add/:id — Add item to cart
app.post('/cart/add/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const quantity = Math.max(1, parseInt(req.body.quantity) || 1);
        const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
        if (!product) return res.status(404).send('Product not found.');
        const existingIdx = req.session.cart.findIndex(item => item.productId === productId);
        if (existingIdx > -1) {
            req.session.cart[existingIdx].quantity += quantity;
        } else {
            req.session.cart.push({ productId, quantity });
        }
        res.redirect('/cart');
    } catch (err) {
        res.status(500).send('Error adding to cart.');
    }
});

// POST /checkout — Place order (auth required)
app.post('/checkout', requireAuth, async (req, res) => {
    try {
        if (!req.session.cart || req.session.cart.length === 0) return res.redirect('/cart');
        let total = 0;
        for (let item of req.session.cart) {
            const product = await db.get('SELECT price FROM products WHERE id = ?', [item.productId]);
            if (product) total += product.price * item.quantity;
        }
        const itemsJson = JSON.stringify(req.session.cart);
        const dateStr = new Date().toISOString();
        const result = await db.run(
            'INSERT INTO orders (user_id, date, items, total) VALUES (?, ?, ?, ?)',
            [req.session.user.id, dateStr, itemsJson, total]
        );
        req.session.cart = [];
        res.render('checkout_success', { orderId: result.lastID, title: "Order Confirmed - TaskStore" });
    } catch (err) {
        res.status(500).send('Error processing order.');
    }
});

// --- 404 Handler ---
app.use((req, res) => {
    res.status(404).send('<h1>404 - Page Not Found</h1><a href="/">Go Home</a>');
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('<h1>500 - Internal Server Error</h1>');
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`TaskStore is running in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`→ http://localhost:${PORT}`);
});
