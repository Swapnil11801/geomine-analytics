"""
FastAPI Backend — Geospatial Mining Degradation Analysis Platform

Entry point for the backend server. Provides REST API endpoints
for Earth Engine processing, analysis, and data retrieval.
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from services.earth_engine import initialize_earth_engine, is_initialized
from routers.earth_engine import router as ee_router
from routers.analysis import router as analysis_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    logger.info("GeoMine Analytics API starting...")

    # Initialize Earth Engine
    ee_ok = initialize_earth_engine()
    if ee_ok:
        logger.info("Earth Engine initialized successfully.")
    else:
        logger.warning(
            "Earth Engine not initialized. "
            "Set EE_PROJECT_ID in server/.env and run 'earthengine authenticate'."
        )

    yield

    # Shutdown
    logger.info("GeoMine Analytics API shutting down...")


app = FastAPI(
    title="GeoMine Analytics API",
    description="Backend API for mining-induced environmental degradation analysis",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(ee_router)
app.include_router(analysis_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "GeoMine Analytics API",
        "version": "0.1.0",
    }


@app.get("/api/v1/status")
async def api_status():
    """API status with module availability."""
    return {
        "status": "operational",
        "modules": {
            "earth_engine": is_initialized(),
            "analysis": True,
            "export": False,
        },
        "message": "GeoMine Analytics API is running.",
    }
