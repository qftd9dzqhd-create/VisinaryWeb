from datetime import datetime, time
from enum import Enum
from typing import List
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import database

@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.init_db()
    yield
    await database.close_db()


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="../frontend"), name="static")


class Building(str, Enum):
    АВИАМОТОРНАЯ = 'А'
    НАРОДНОЕ = 'Н'

class RoomSize(str, Enum):
    МАЛЕНЬКАЯ = 'S'
    СЕМИНАРСКАЯ = 'M'
    ЛЕКЦИОННАЯ = 'L'

class BookRequest(BaseModel):
    room_id: str
    date: str
    lessons: List[int]


def many_lessons(lessons: List[str]) -> List[int]:
    return [
        int(part.strip())
        for item in lessons
        for part in item.split(',')
        if part.strip().isdigit()
    ]


@app.get('/')
def home_page():
    return FileResponse("../frontend/index.html")


@app.get('/found_free')
async def search(
        building: Building, floor: int, size: RoomSize, date: str, lesson: List[str] = Query(...)
):
    lessons_ints = home_page(lesson)

    async with database.pool.acquire() as connection:
        rows = await connection.fetch("""
            SELECT r.room_id, r.new_old, r.is_socket 
            FROM rooms r
            WHERE r.building = $1 AND r.floor = $2 AND r.size = $3
              AND NOT EXISTS (
                  SELECT 1 FROM timetable t 
                  WHERE t.date = $4 AND t.lesson_number = ANY($5) AND r.room_id = ANY(t.busy_rooms)
              );
        """, building.value, floor, size.value, date, lessons_ints)

    return {
        "status": "success",
        "free_rooms": [
            {"room_id": r['room_id'], "new_old": r['new_old'], "is_socket": r['is_socket']}
            for r in rows
        ]
    }


@app.get('/free_busy')
async def free_busy(building: Building, date: str, lesson: List[str] = Query(...)):
    lessons_ints = home_page(lesson)

    async with database.pool.acquire() as connection:
        row = await connection.fetchrow("""
            SELECT 
                (SELECT COUNT(*) FROM rooms WHERE building = $1) as total_count,
                COUNT(*) as free_count
            FROM rooms r
            WHERE r.building = $1
              AND NOT EXISTS (
                  SELECT 1 FROM timetable t 
                  WHERE t.date = $2 AND t.lesson_number = ANY($3) AND r.room_id = ANY(t.busy_rooms)
              );
        """, building.value, date, lessons_ints)

        total = row['total_count'] or 0
        free = row['free_count'] or 0
        return {"free": free, "busy": max(0, total - free)}


@app.get('/now')
def current_lesson():
    today = datetime.now().date()
    now_dt = datetime.now()
    now = now_dt.time()

    week_status = "четная" if today.isocalendar()[1] % 2 == 0 else "нечетная"
    base_res = {"time": now.strftime("%H:%M"), "week": week_status}

    if now < time(9, 30):
        return {**base_res, "lesson_status": {"status": "not_started", "number": 1, "time_left": ""}}
    if now > time(21, 55):
        return {**base_res, "lesson_status": {"status": "finished", "number": None, "time_left": ""}}

    time_table = [
        (time(9, 30), time(11, 0), "lesson", 1),
        (time(11, 0), time(11, 15), "break", 2),
        (time(11, 15), time(12, 45), "lesson", 2),
        (time(12, 45), time(13, 0), "break", 3),
        (time(13, 0), time(14, 30), "lesson", 3),
        (time(14, 30), time(15, 10), "break", 4),
        (time(15, 10), time(16, 40), "lesson", 4),
        (time(16, 40), time(16, 55), "break", 5),
        (time(16, 55), time(18, 25), "lesson", 5),
        (time(18, 25), time(18, 40), "break", 6),
        (time(18, 40), time(20, 10), "lesson", 6),
        (time(20, 10), time(20, 25), "break", 7),
        (time(20, 25), time(21, 55), "lesson", 7),
    ]

    for start, end, status_type, num in time_table:
        if start <= now <= end:
            diff = datetime.combine(today, end) - now_dt
            minutes, seconds = divmod(diff.seconds, 60)
            return {
                **base_res,
                "lesson_status": {
                    "status": status_type,
                    "number": num,
                    "time_left": f"{minutes:02d}:{seconds:02d}"
                }
            }


@app.post('/book')
async def book_room(req: BookRequest):
    async with database.pool.acquire() as connection:
        async with connection.transaction():
            for lesson in req.lessons:
                row = await connection.fetchrow(
                    "SELECT busy_rooms FROM timetable WHERE date = $1 AND lesson_number = $2",
                    req.date, lesson
                )
                if row:
                    busy_rooms = row['busy_rooms'] or []
                    if req.room_id not in busy_rooms:
                        await connection.execute(
                            "UPDATE timetable SET busy_rooms = array_append(busy_rooms, $1) WHERE date = $2 AND lesson_number = $3",
                            req.room_id, req.date, lesson
                        )
                else:
                    await connection.execute(
                        "INSERT INTO timetable (date, lesson_number, busy_rooms) VALUES ($1, $2, ARRAY[$3])",
                        req.date, lesson, req.room_id
                    )

    return {"status": "success", "message": f"Аудитория {req.room_id} успешно забронирована!"}