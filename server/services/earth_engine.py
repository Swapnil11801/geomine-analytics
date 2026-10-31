"""
Earth Engine Service Module

Handles authentication and initialization of the Google Earth Engine
Python API. Provides helper functions for verifying the connection.
"""

import ee
import os
import logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Track initialization state
_ee_initialized = False


def initialize_earth_engine() -> bool:
    """
    Authenticate and initialize the Earth Engine API.

    Uses Application Default Credentials (ADC) which are set up
    by running `earthengine authenticate` in the terminal.

    Returns:
        True if initialization was successful, False otherwise.
    """
    global _ee_initialized

    project_id = os.getenv("EE_PROJECT_ID")

    if not project_id:
        logger.warning(
            "EE_PROJECT_ID not set in environment. "
            "Create a .env file in server/ with: EE_PROJECT_ID=your-project-id"
        )
        return False

    try:
        # Use Application Default Credentials (set via `earthengine authenticate`)
        ee.Initialize(project=project_id)
        _ee_initialized = True
        logger.info(
            "Earth Engine initialized successfully with project: %s", project_id
        )
        return True
    except ee.EEException as e:
        logger.error("Earth Engine initialization failed: %s", e)
        _ee_initialized = False
        return False
    except Exception as e:
        logger.error("Unexpected error initializing Earth Engine: %s", e)
        _ee_initialized = False
        return False


def is_initialized() -> bool:
    """Check whether the Earth Engine API has been initialized."""
    return _ee_initialized


def verify_connection() -> dict:
    """
    Run a simple Earth Engine computation to verify the connection.

    Fetches the elevation of Mount Everest from the SRTM DEM dataset
    as a quick proof-of-life test.

    Returns:
        Dictionary with verification results.
    """
    if not _ee_initialized:
        return {
            "success": False,
            "error": "Earth Engine not initialized",
            "data": None,
        }

    try:
        # Use SRTM Digital Elevation Model
        srtm = ee.Image("USGS/SRTMGL1_003")

        # Mount Everest coordinates
        everest = ee.Geometry.Point([86.925, 27.988])

        # Sample the elevation at that point
        elevation = srtm.sample(everest, scale=30).first().get("elevation")
        elevation_value = elevation.getInfo()

        return {
            "success": True,
            "error": None,
            "data": {
                "test": "SRTM elevation at Mount Everest",
                "coordinates": {"lng": 86.925, "lat": 27.988},
                "elevation_m": elevation_value,
                "dataset": "USGS/SRTMGL1_003",
            },
        }
    except ee.EEException as e:
        return {
            "success": False,
            "error": f"Earth Engine computation error: {str(e)}",
            "data": None,
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "data": None,
        }
