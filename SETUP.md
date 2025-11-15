# Setup Instructions

## Database Configuration

Create a `.env` file in the root directory with the following variables:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=fps_game
PORT=3000
```

## MySQL Database Setup

1. Create the database:
```sql
CREATE DATABASE fps_game;
```

2. The server will automatically create the `scores` table when it starts.

## Running the Game

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Development Mode

For development with auto-reload:
```bash
npm run dev
```

