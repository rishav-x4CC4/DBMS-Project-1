const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ShootingGameDB',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Initialize database
async function initDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS PLAYER (
        PlayerID INT AUTO_INCREMENT PRIMARY KEY,
        Username VARCHAR(50) NOT NULL UNIQUE,
        Age INT NULL CHECK (Age > 0),
        Country VARCHAR(50)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS MATCHES (
        MatchID INT AUTO_INCREMENT PRIMARY KEY,
        MatchDate DATE NOT NULL,
        MapName VARCHAR(100) NOT NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS SCOREBOARD (
        PlayerID INT NOT NULL,
        MatchID INT NOT NULL,
        Kills INT DEFAULT 0,
        Deaths INT DEFAULT 0,
        Accuracy DECIMAL(5,2),
        Score INT DEFAULT 0,
        RankP INT,
        PRIMARY KEY (PlayerID, MatchID),
        FOREIGN KEY (PlayerID) REFERENCES PLAYER(PlayerID)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        FOREIGN KEY (MatchID) REFERENCES MATCHES(MatchID)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS LEADERBOARD (
        PlayerID INT PRIMARY KEY,
        TotalMatchesPlayed INT DEFAULT 0,
        TotalScore INT DEFAULT 0,
        AverageAccuracy DECIMAL(5,2),
        BestRank INT,
        FOREIGN KEY (PlayerID) REFERENCES PLAYER(PlayerID)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )
    `);

    // Ensure schema matches expected column naming when migrating from older versions
    try {
      await connection.query(
        'ALTER TABLE SCOREBOARD CHANGE COLUMN PlayerRank RankP INT DEFAULT NULL'
      );
    } catch (renameError) {
      if (renameError.code !== 'ER_BAD_FIELD_ERROR') {
        throw renameError;
      }
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  } finally {
    if (connection) connection.release();
  }
}

// Get top scores (all scores, not just top 10)
app.get('/api/scores', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100; // Default to 100, allow custom limit
    const [rows] = await pool.query(
      `
        SELECT 
          p.Username AS playerName,
          s.Score AS score,
          s.Kills AS kills,
          s.Deaths AS deaths,
          s.Accuracy AS accuracy,
          s.RankP AS rank,
          m.MapName AS mapName,
          m.MatchDate AS matchDate,
          s.PlayerID AS playerId,
          s.MatchID AS matchId
        FROM SCOREBOARD s
        INNER JOIN PLAYER p ON s.PlayerID = p.PlayerID
        INNER JOIN MATCHES m ON s.MatchID = m.MatchID
        ORDER BY s.Score DESC, m.MatchDate DESC
        LIMIT ?
      `,
      [limit]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching scores:', error);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

// Get all scores for a specific player
app.get('/api/scores/player/:playerName', async (req, res) => {
  try {
    const playerName = req.params.playerName;
    const [rows] = await pool.query(
      `
        SELECT 
          p.Username AS playerName,
          s.Score AS score,
          s.Kills AS kills,
          s.Deaths AS deaths,
          s.Accuracy AS accuracy,
          s.RankP AS rank,
          m.MapName AS mapName,
          m.MatchDate AS matchDate,
          s.PlayerID AS playerId,
          s.MatchID AS matchId
        FROM SCOREBOARD s
        INNER JOIN PLAYER p ON s.PlayerID = p.PlayerID
        INNER JOIN MATCHES m ON s.MatchID = m.MatchID
        WHERE p.Username = ?
        ORDER BY m.MatchDate DESC, s.Score DESC
      `,
      [playerName]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching player scores:', error);
    res.status(500).json({ error: 'Failed to fetch player scores' });
  }
});

// Submit score (saves all games, regardless of score)
app.post('/api/scores', async (req, res) => {
  try {
    const {
      playerName,
      age,
      country,
      score,
      kills,
      deaths,
      accuracy,
      rank,
      matchDate,
      mapName
    } = req.body;

    if (!playerName) {
      return res.status(400).json({ error: 'Missing required field: playerName' });
    }

    const parsedScore = Number.isNaN(Number(score)) ? 0 : Number(score);
    const parsedKills = Number.isNaN(Number(kills)) ? 0 : Number(kills);
    const parsedDeaths = Number.isNaN(Number(deaths)) ? 0 : Number(deaths);
    const parsedAccuracy =
      accuracy !== undefined && accuracy !== null && !Number.isNaN(Number(accuracy))
        ? Number(accuracy)
        : null;
    const parsedRank =
      rank !== undefined && rank !== null && !Number.isNaN(Number(rank)) ? Number(rank) : null;
    const validatedAge =
      age !== undefined && age !== null && !Number.isNaN(Number(age)) && Number(age) > 0
        ? Number(age)
        : null;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Find or create player
      let playerId;
      const [existingPlayer] = await connection.query(
        'SELECT PlayerID FROM PLAYER WHERE Username = ?',
        [playerName]
      );

      if (existingPlayer.length > 0) {
        playerId = existingPlayer[0].PlayerID;
      } else {
        const [playerInsert] = await connection.query(
          'INSERT INTO PLAYER (Username, Age, Country) VALUES (?, ?, ?)',
          [playerName, validatedAge, country ?? null]
        );
        playerId = playerInsert.insertId;
      }

      if (existingPlayer.length > 0) {
        const updates = [];
        const params = [];

        if (validatedAge !== null) {
          updates.push('Age = ?');
          params.push(validatedAge);
        }

        if (country) {
          updates.push('Country = ?');
          params.push(country);
        }

        if (updates.length > 0) {
          params.push(playerId);
          await connection.query(`UPDATE PLAYER SET ${updates.join(', ')} WHERE PlayerID = ?`, params);
        }
      }

      // Create match entry
      const matchDay = matchDate ? new Date(matchDate) : new Date();
      const formattedMatchDate = matchDay.toISOString().slice(0, 10);
      const map = mapName || 'Unknown';

      const [matchInsert] = await connection.query(
        'INSERT INTO MATCHES (MatchDate, MapName) VALUES (?, ?)',
        [formattedMatchDate, map]
      );
      const matchId = matchInsert.insertId;

      // Insert scoreboard entry
      await connection.query(
        `
          INSERT INTO SCOREBOARD 
            (PlayerID, MatchID, Kills, Deaths, Accuracy, Score, RankP)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          playerId,
          matchId,
          parsedKills,
          parsedDeaths,
          parsedAccuracy,
          parsedScore,
          parsedRank
        ]
      );

      const [[leaderboardStats]] = await connection.query(
        `
          SELECT 
            COUNT(*) AS matchesPlayed,
            COALESCE(SUM(Score), 0) AS totalScore,
            ROUND(AVG(Accuracy), 2) AS averageAccuracy,
            MIN(RankP) AS bestRank
          FROM SCOREBOARD
          WHERE PlayerID = ?
        `,
        [playerId]
      );

      const averageAccuracyValue =
        leaderboardStats.averageAccuracy !== null && leaderboardStats.averageAccuracy !== undefined
          ? Number(leaderboardStats.averageAccuracy)
          : null;

      const bestRankValue =
        leaderboardStats.bestRank !== null && leaderboardStats.bestRank !== undefined
          ? Number(leaderboardStats.bestRank)
          : null;

      await connection.query(
        `
          INSERT INTO LEADERBOARD (PlayerID, TotalMatchesPlayed, TotalScore, AverageAccuracy, BestRank)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            TotalMatchesPlayed = VALUES(TotalMatchesPlayed),
            TotalScore = VALUES(TotalScore),
            AverageAccuracy = VALUES(AverageAccuracy),
            BestRank = VALUES(BestRank)
        `,
        [
          playerId,
          Number(leaderboardStats.matchesPlayed) || 0,
          Number(leaderboardStats.totalScore) || 0,
          averageAccuracyValue,
          bestRankValue
        ]
      );

      await connection.commit();

      console.log(
        `Score saved: ${playerName} - Score: ${parsedScore}, Kills: ${parsedKills}, Deaths: ${parsedDeaths}`
      );

      res.json({
        message: 'Score saved successfully',
        playerId,
        matchId
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error saving score:', error);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// Leaderboard: aggregate per player
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const [rows] = await pool.query(
      `
        SELECT 
          p.Username AS playerName,
          l.TotalMatchesPlayed AS gamesPlayed,
          l.TotalScore AS totalScore,
          l.AverageAccuracy AS averageAccuracy,
          l.BestRank AS bestRank,
          COALESCE(SUM(s.Kills), 0) AS totalKills,
          COALESCE(SUM(s.Deaths), 0) AS totalDeaths,
          COALESCE(MAX(s.Score), 0) AS bestScore
        FROM LEADERBOARD l
        INNER JOIN PLAYER p ON l.PlayerID = p.PlayerID
        LEFT JOIN SCOREBOARD s ON l.PlayerID = s.PlayerID
        GROUP BY 
          l.PlayerID,
          p.Username,
          l.TotalMatchesPlayed,
          l.TotalScore,
          l.AverageAccuracy,
          l.BestRank
        ORDER BY 
          l.TotalScore DESC,
          (l.BestRank IS NULL),
          l.BestRank ASC,
          p.Username ASC
        LIMIT ?
      `,
      [limit]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initDatabase();
});

