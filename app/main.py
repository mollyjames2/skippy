from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


app = FastAPI(title="Skippy")

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


# ---- Mock data for v1 skeleton ----

def _mock_week(location: str) -> Dict[str, Any]:
    # 7-day mocked daily summaries and a "best window" placeholder.
    # We'll replace this with real marine + tide data soon.
    today = date.today()
    days: List[Dict[str, Any]] = []

    for i in range(7):
        d = today + timedelta(days=i)
        # Fake some variation:
        score = 85 - (i * 3) if i < 4 else 70 - (i * 2)
        score = max(35, min(95, score))

        wind_kts = 8 + i
        wave_m = round(0.6 + (i * 0.1), 1)

        rating = "Excellent" if score >= 80 else "Good" if score >= 60 else "Fair" if score >= 40 else "Poor/Avoid"

        days.append(
            {
                "date": d.isoformat(),
                "dow": d.strftime("%a"),
                "label": d.strftime("%d %b"),
                "temp_c": round(8.5 + (i * 0.3), 1),
                "condition": "Overcast" if i % 2 == 0 else "Partly cloudy",
                "score": int(score),
                "rating": rating,
                "wind": {"kts": int(wind_kts), "dir": "SSW"},
                "waves": {"m": wave_m, "period_s": 5},
                "best_time": {"start": "06:00", "end": "20:00"},
            }
        )

    best = max(days, key=lambda x: x["score"])
    return {"location": location, "best_day": best, "days": days}


def _mock_day_details(day_iso: str, location: str) -> Dict[str, Any]:
    # Fake hourly scoring (00-23). We'll replace later.
    d = datetime.fromisoformat(day_iso).date()
    hours: List[Dict[str, Any]] = []
    for h in range(24):
        t = f"{h:02d}:00"
        base = 60 + (h - 12) * (1 if h >= 12 else -1)
        score = max(35, min(95, base))
        wind = 6 + (h % 6)
        waves = round(0.6 + ((h % 8) * 0.1), 1)
        hours.append(
            {
                "time": t,
                "temp_c": round(7.5 + (h * 0.05), 1),
                "wind_kts": wind,
                "wave_m": waves,
                "score": int(score),
            }
        )

    # Mock tides. Real version will come from Dartmouth tide station.
    tides = [
        {"type": "High", "time": "04:34", "height_m": 6.2},
        {"type": "Low", "time": "10:46", "height_m": 2.0},
        {"type": "High", "time": "16:58", "height_m": 5.7},
    ]

    # Mock "recommended window" that will later respect the +/-1h rule.
    recommended = [{"start": "06:00", "end": "20:00", "score": 85}]

    return {
        "location": location,
        "date": d.isoformat(),
        "title": d.strftime("%A %d %b"),
        "summary": {"temp_c": 9, "condition": "Overcast", "score": 85},
        "tiles": {
            "wind_kts": 13,
            "gust_kts": 19,
            "wind_dir": "SSW",
            "wave_m": 1.1,
            "period_s": 4.6,
            "visibility_km": 22.7,
            "precip_mm": 0.0,
            "sunrise": "07:50",
            "sunset": "16:18",
        },
        "tides": tides,
        "recommended": recommended,
        "hours": hours,
    }


# ---- Web pages ----

@app.get("/", response_class=HTMLResponse)
def home(request: Request, location: str = "Dartmouth, UK") -> HTMLResponse:
    data = _mock_week(location)
    return templates.TemplateResponse("home.html", {"request": request, "data": data})


@app.get("/day/{day_iso}", response_class=HTMLResponse)
def day(request: Request, day_iso: str, location: str = "Dartmouth, UK") -> HTMLResponse:
    details = _mock_day_details(day_iso, location)
    return templates.TemplateResponse("day.html", {"request": request, "data": details})


@app.get("/settings", response_class=HTMLResponse)
def settings(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("settings.html", {"request": request})


# ---- API endpoints (for later frontend polish) ----

@app.get("/api/week")
def api_week(location: str = "Dartmouth, UK") -> JSONResponse:
    return JSONResponse(_mock_week(location))


@app.get("/api/day")
def api_day(day_iso: str, location: str = "Dartmouth, UK") -> JSONResponse:
    return JSONResponse(_mock_day_details(day_iso, location))

