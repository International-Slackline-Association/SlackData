from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlmodel import select

from slack_data.database import get_session, create_db_and_tables
from slack_data.load_data.load_weblocks import load_weblocks
from slack_data.load_data.load_rollers import load_rollers
from slack_data.load_data.load_webbings import load_webbings
from slack_data.load_data.load_leashrings import load_leashrings
from slack_data.load_data.load_grips import load_grips
from slack_data.load_data.load_treepros import load_treepros
from slack_data.load_data.load_starterkits import load_starterkits
from slack_data.api.routers.brand_router import brand_router
from slack_data.api.routers.roller_router import roller_router
from slack_data.api.routers.webbing_router import webbing_router
from slack_data.api.routers.weblock_router import weblock_router
from slack_data.api.routers.leashring_router import leashring_router
from slack_data.api.routers.treepro_router import treepro_router
from slack_data.api.routers.starterkit_router import starterkit_router
from slack_data.api.routers.grip_router import grip_router
from slack_data.models.rollers import Roller
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock
from slack_data.models.leashrings import LeashRing
from slack_data.models.grips import Grip
from slack_data.models.treepro import TreePro
from slack_data.models.starterkits import StarterKit


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    with next(get_session()) as session:
        existing_webbings = session.exec(select(Webbing)).first()
        if existing_webbings is None: # Only load from `webbings.json` if the database is empty
            print("Loading webbing data into the database...")
            load_webbings(session=session)
        existing_weblocks = session.exec(select(Weblock)).first()
        if existing_weblocks is None: # Only load from `webbings.json` if the database is empty
            print("Loading weblocks data into the database...")
            load_weblocks(session=session)
        existing_rollers = session.exec(select(Roller)).first()
        if existing_rollers is None: # Only load from `rollers.json` if the database is empty
            print("Loading roller data into the database...")
            load_rollers(session=session)
        existing_leashrings = session.exec(select(LeashRing)).first()
        if existing_leashrings is None: # Only load from `leashrings.json` if the database is empty
            print("Loading leash ring data into the database...")
            load_leashrings(session=session)
        existing_grips = session.exec(select(Grip)).first()
        if existing_grips is None: # Only load from `grips.json` if the database is empty
            print("Loading grip data into the database...")
            load_grips(session=session)
        existing_treepros = session.exec(select(TreePro)).first()
        if existing_treepros is None: # Only load from `treepros.json` if the database is empty
            print("Loading treepro data into the database...")
            load_treepros(session=session)
        existing_starterkits = session.exec(select(StarterKit)).first()
        if existing_starterkits is None: # Only load from `starterkits.json` if the database is empty
            print("Loading starter kit data into the database...")
            load_starterkits(session=session)
    yield

app = FastAPI(lifespan=lifespan)

app.include_router(webbing_router)
app.include_router(brand_router)
app.include_router(weblock_router)
app.include_router(roller_router)
app.include_router(leashring_router)
app.include_router(grip_router)
app.include_router(treepro_router)
app.include_router(starterkit_router)

@app.get("/")
def root():
    return {"message": "Welcome to SlackData"}


