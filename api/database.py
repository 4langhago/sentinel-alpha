import os
import sqlite3
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("DB_PATH", "/tmp/auction_data.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auction_items (
            id TEXT PRIMARY KEY,
            case_number TEXT NOT NULL,
            court TEXT NOT NULL,
            address TEXT NOT NULL,
            property_type TEXT NOT NULL,
            area REAL NOT NULL,
            minimum_bid INTEGER NOT NULL,
            appraisal_value INTEGER NOT NULL,
            auction_date TEXT NOT NULL,
            description TEXT,
            images TEXT,
            status TEXT NOT NULL,
            rights TEXT,
            risk_score REAL DEFAULT 0.0,
            discount_rate REAL DEFAULT 0.0,
            yield_rate REAL DEFAULT 0.0,
            risk_items TEXT,
            fetched_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()
    logger.info("Database initialized")

def save_items(items: List[Dict[str, Any]]) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    saved_count = 0
    for item in items:
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO auction_items (
                    id, case_number, court, address, property_type, area,
                    minimum_bid, appraisal_value, auction_date, description,
                    images, status, rights, risk_score, discount_rate, yield_rate,
                    risk_items, fetched_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item.get("id", item.get("case_number", "")),
                item.get("case_number", ""),
                item.get("court", ""),
                item.get("address", ""),
                item.get("property_type", ""),
                item.get("area", 0.0),
                item.get("minimum_bid", 0),
                item.get("appraisal_value", 0),
                item.get("auction_date", ""),
                item.get("description", ""),
                json.dumps(item.get("images", []), ensure_ascii=False),
                item.get("status", "SCHEDULED"),
                json.dumps(item.get("rights", []), ensure_ascii=False),
                item.get("risk_score", 0.0),
                item.get("discount_rate", 0.0),
                item.get("yield_rate", 0.0),
                json.dumps(item.get("risk_items", []), ensure_ascii=False),
                now
            ))
            saved_count += 1
        except Exception as e:
            logger.warning(f"Failed to save item {item.get('case_number')}: {e}")
    
    conn.commit()
    conn.close()
    logger.info(f"Saved {saved_count} items to database")
    return saved_count

def get_all_items() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM auction_items")
    rows = cursor.fetchall()
    conn.close()
    
    items = []
    for row in rows:
        item = dict(row)
        item["images"] = json.loads(item.get("images", "[]"))
        item["rights"] = json.loads(item.get("rights", "[]"))
        item["risk_items"] = json.loads(item.get("risk_items", "[]"))
        items.append(item)
    
    logger.info(f"Retrieved {len(items)} items from database")
    return items

def get_last_update() -> Optional[str]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM metadata WHERE key = 'last_update'")
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else None

def set_last_update(timestamp: str) -> None:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO metadata (key, value)
        VALUES ('last_update', ?)
    """, (timestamp,))
    conn.commit()
    conn.close()
    logger.info(f"Set last_update to {timestamp}")

def get_item_count() -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM auction_items")
    row = cursor.fetchone()
    conn.close()
    return row["count"] if row else 0
