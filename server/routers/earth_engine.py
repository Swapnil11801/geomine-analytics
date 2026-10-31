"""
Earth Engine API Router

Provides endpoints for verifying and interacting with the
Google Earth Engine connection, including tile generation for map overlays.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.earth_engine import is_initialized, verify_connection
from services.analysis import generate_ndvi_tiles, generate_change_tiles

router = APIRouter(prefix="/api/v1/ee", tags=["Earth Engine"])


class TileRequest(BaseModel):
    """Request body for tile generation."""
    geometry: dict
    year: int
    layer_type: str = "ndvi"  # "ndvi" or "change"
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    season: str = "nov_feb"


@router.get("/verify")
async def verify_ee_connection():
    """
    Verify Earth Engine connectivity by running a simple computation.

    Returns the elevation of Mount Everest from the SRTM DEM as
    a proof-of-life test for the Earth Engine pipeline.
    """
    if not is_initialized():
        return {
            "status": "unavailable",
            "message": "Earth Engine is not initialized. Check EE_PROJECT_ID in .env and run 'earthengine authenticate'.",
            "result": None,
        }

    result = verify_connection()

    if result["success"]:
        return {
            "status": "connected",
            "message": "Earth Engine pipeline is operational.",
            "result": result["data"],
        }
    else:
        return {
            "status": "error",
            "message": result["error"],
            "result": None,
        }


@router.get("/status")
async def ee_status():
    """Return the current Earth Engine initialization status."""
    return {
        "initialized": is_initialized(),
    }


@router.post("/tiles")
async def get_ee_tiles(req: TileRequest):
    """
    Generate Earth Engine map tile URLs for visualization overlays.
    
    Supports:
    - "ndvi": NDVI composite for a single year (red-yellow-green palette)
    - "change": NDVI difference between start_year and end_year (red = loss, green = gain)
    
    Returns a tile URL template with {x}, {y}, {z} placeholders
    that can be consumed directly by MapLibre GL as a raster source.
    """
    if not is_initialized():
        raise HTTPException(status_code=503, detail="Earth Engine is not initialized")

    if req.layer_type == "ndvi":
        result = generate_ndvi_tiles(req.geometry, req.year, req.season)
    elif req.layer_type == "change":
        if not req.start_year or not req.end_year:
            raise HTTPException(status_code=400, detail="start_year and end_year are required for change tiles")
        result = generate_change_tiles(req.geometry, req.start_year, req.end_year, req.season)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown layer_type: {req.layer_type}")

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Tile generation failed"))

    return result
