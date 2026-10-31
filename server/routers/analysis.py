"""
Analysis Router

Provides endpoints for running geospatial analysis via Earth Engine.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from services.earth_engine import is_initialized
from services.analysis import compute_analysis

router = APIRouter(prefix="/api/v1/analysis", tags=["Analysis"])

class AnalysisRequest(BaseModel):
    geometry: Dict[str, Any]
    start_year: int
    end_year: int
    season: str = "nov_feb"  # "nov_feb", "jun_sep" or "full_year" ("dry"/"wet" still accepted)

@router.post("/")
async def run_analysis(req: AnalysisRequest):
    """
    Run Earth Engine analysis on a given geometry and time range.
    """
    if not is_initialized():
        raise HTTPException(status_code=503, detail="Earth Engine is not initialized")
        
    result = compute_analysis(req.geometry, req.start_year, req.end_year, req.season)
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Analysis failed"))
        
    return result["data"]
