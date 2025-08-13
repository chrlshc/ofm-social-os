"""
Database helper for admin panel

Provides database session management for admin operations.
"""

from contextlib import contextmanager
from sqlalchemy.orm import Session
from typing import Generator

# Import from your existing database module
try:
    from payment.src.database import db_service
except ImportError:
    # Fallback for development
    db_service = None


@contextmanager
def get_db() -> Generator[Session, None, None]:
    """
    Get database session context manager
    
    Yields:
        Database session
    """
    if db_service:
        with db_service.get_session() as session:
            yield session
    else:
        # Fallback implementation for testing
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        
        engine = create_engine("sqlite:///test.db")
        SessionLocal = sessionmaker(bind=engine)
        
        session = SessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()