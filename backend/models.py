from sqlalchemy import Column, String, Float, DateTime
from datetime import datetime, timezone
import uuid
from .database import Base

def generate_uuid():
    return str(uuid.uuid4())

class Incident(Base):
    __tablename__ = "incidents"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String)
    severity = Column(String)
    status = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    summary = Column(String, nullable=True)

class Deployment(Base):
    __tablename__ = "deployments"
    id = Column(String, primary_key=True, default=generate_uuid)
    service = Column(String)
    version = Column(String)
    timestamp = Column(DateTime)
    commit_hash = Column(String)

class Log(Base):
    __tablename__ = "logs"
    id = Column(String, primary_key=True, default=generate_uuid)
    service = Column(String)
    level = Column(String)
    message = Column(String)
    timestamp = Column(DateTime)

class RemediationHistory(Base):
    __tablename__ = "remediation_history"
    id = Column(String, primary_key=True, default=generate_uuid)
    incident_id = Column(String)
    action = Column(String)
    outcome = Column(String)
    confidence = Column(Float)
