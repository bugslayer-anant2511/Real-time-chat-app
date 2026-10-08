# Real-Time Chat Application

A full-stack, real-time chat application featuring a modern React frontend and a robust Express/MongoDB backend.

## 🚀 Tech Stack

### Frontend (Client)
- **Framework**: React 19 with Vite
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Routing**: React Router DOM
- **State/API**: Axios
- **Real-time**: Socket.io-client
- **UI Components**: Emoji Picker React, React Hot Toast

### Backend (Server)
- **Runtime**: Node.js (>= 18.18.0)
- **Framework**: Express 5
- **Database**: MongoDB with Mongoose
- **Real-time**: Socket.io
- **Authentication**: JWT (JSON Web Tokens) & bcryptjs
- **File Uploads**: Cloudinary & Multer
- **API Documentation**: Swagger (swagger-jsdoc & swagger-ui-express)
- **Security**: Helmet, express-rate-limit, express-mongo-sanitize, CORS
- **Tasks**: node-cron

## 📂 Project Structure

This is a monorepo setup containing both the client and server.

- `/client` - React frontend application
- `/server` - Express backend API and Socket.io server

## 🛠️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/bugslayer-anant2511/Real-time-chat-app.git
   cd Real-time-chat-app
   ```

2. **Setup the Backend**
   ```bash
   cd server
   npm install
   ```
   Create a `.env` file in the `/server` directory and add your environment variables (MongoDB URI, JWT Secret, Cloudinary credentials, etc.).
   
   Start the development server:
   ```bash
   npm run dev
   ```

3. **Setup the Frontend**
   ```bash
   cd ../client
   npm install
   ```
   Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   
   Start the Vite development server:
   ```bash
   npm run dev
   ```

## 📜 Scripts

### Server
- `npm run dev`: Starts the server in development mode using Nodemon
- `npm start`: Starts the production server
- `npm run seed:admin`: Seeds the database with an initial admin user

### Client
- `npm run dev`: Starts the Vite development server
- `npm run build`: Builds the app for production
- `npm run preview`: Previews the production build locally

## 👤 Author

**Anant Kumar Singh**
- Email: anantsingh2511@gmail.com

## 📄 License

This project is licensed under the MIT License.
