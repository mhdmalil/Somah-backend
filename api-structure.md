# API Structure for Somah Land

This document outlines the planned API structure for Somah Land. These endpoints will be implemented as Next.js API routes.

## Authentication

- `POST /api/auth/signup`: Register a new user
- `POST /api/auth/login`: Log in a user
- `POST /api/auth/logout`: Log out a user
- `POST /api/auth/forgot-password`: Request a password reset
- `POST /api/auth/reset-password`: Reset a password with a token

## Users

- `GET /api/users/me`: Get the current user's profile
- `PUT /api/users/me`: Update the current user's profile
- `GET /api/users/me/addresses`: Get the current user's addresses
- `POST /api/users/me/addresses`: Add a new address
- `PUT /api/users/me/addresses/:id`: Update an address
- `DELETE /api/users/me/addresses/:id`: Delete an address

## Stores

- `GET /api/stores`: Get a list of stores
- `POST /api/stores`: Create a new store
- `GET /api/stores/:id`: Get a specific store
- `PUT /api/stores/:id`: Update a store
- `DELETE /api/stores/:id`: Delete a store
- `GET /api/stores/:id/products`: Get products for a store
- `POST /api/stores/:id/products`: Add a product to a store

## Products

- `GET /api/products`: Get a list of products
- `GET /api/products/:id`: Get a specific product
- `PUT /api/products/:id`: Update a product
- `DELETE /api/products/:id`: Delete a product
- `POST /api/products/:id/images`: Add images to a product
- `DELETE /api/products/:id/images/:imageId`: Delete an image from a product

## Cart

- `GET /api/cart`: Get the current user's cart
- `POST /api/cart`: Add an item to the cart
- `PUT /api/cart/:itemId`: Update a cart item
- `DELETE /api/cart/:itemId`: Remove an item from the cart
- `DELETE /api/cart`: Clear the cart

## Orders

- `GET /api/orders`: Get the current user's orders
- `POST /api/orders`: Create a new order
- `GET /api/orders/:id`: Get a specific order
- `PUT /api/orders/:id/status`: Update an order's status
- `GET /api/stores/:id/orders`: Get orders for a specific store (for store owners)

## Admin API

- `POST /api/admin/login`: Admin login
- `GET /api/admin/dashboard`: Get dashboard statistics
- `GET /api/admin/orders`: Get all orders
- `GET /api/admin/orders/:id`: Get a specific order
- `PUT /api/admin/orders/:id/status`: Update an order's status
- `GET /api/admin/users`: Get all users
- `GET /api/admin/stores`: Get all stores
- `PUT /api/admin/stores/:id/status`: Update a store's status
- `GET /api/admin/payouts`: Get all payouts
- `POST /api/admin/payouts`: Create a new payout
- `GET /api/admin/telegram/notifications`: Get all Telegram notifications

## Future Implementation: Telegram Integration

- `POST /api/telegram/webhook`: Webhook for Telegram Bot
- `POST /api/telegram/send`: Send a message to Telegram
- `GET /api/telegram/notifications`: Get unsent notifications
- `PUT /api/telegram/notifications/:id`: Mark a notification as sent
