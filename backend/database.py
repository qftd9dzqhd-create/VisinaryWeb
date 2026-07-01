import asyncpg

pool = None

async def init_db():
    global pool
    pool = await asyncpg.create_pool(
        user="semenbarinov",
        password="semenbarinov",
        database="visi_db",
        host="127.0.0.1",
        port=5432
    )


async def close_db():
    global pool
    if pool:
        await pool.close()
