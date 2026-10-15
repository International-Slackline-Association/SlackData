"""
Media the site reads — and, locally only, the two things S3 and CloudFront do
hosted (LIVE_EDITING_PHASE_4.md P4-C, P4-G).

| route | |
|---|---|
| `GET /media/manifest` | every item's and brand's photos, manuals and logo, and where to fetch them (`base`) |
| `POST /media/uploads/{upload}` | **local only**: receives an upload form, as S3's presigned POST does hosted |
| `GET /media/{key}` | **local only**: serves a media file, as CloudFront's `/media/*` does hosted |

Hosted, the two local routes answer 404 — exactly as the dev tokens are refused
there — and `/media/*` never reaches the API: CloudFront sends it to the media
bucket. The manifest itself is `/api/media/manifest` there, like every route.
"""

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse

from slack_data.media.manifest import current_manifest
from slack_data.media.store import (
    CACHE_CONTROL,
    FilesystemMediaStore,
    UploadRefused,
    content_type_of,
    media_base_url,
    media_store,
)

media_router = APIRouter(prefix="/media", tags=["media"])


@media_router.get("/manifest")
def manifest(request: Request) -> dict:
    return {"base": media_base_url(str(request.base_url)), **current_manifest()}


def _local() -> FilesystemMediaStore:
    from slack_data.deployment import is_hosted

    store = media_store()
    if is_hosted() or not isinstance(store, FilesystemMediaStore):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
    return store


# Neither stand-in is API surface — hosted they do not exist — so neither is in
# the OpenAPI schema.
@media_router.post("/uploads/{upload_id}", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def receive_upload(upload_id: str, request: Request) -> Response:
    store = _local()
    form = await request.form()
    upload = form.get("file")
    if upload is None or isinstance(upload, str):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no file in the form")
    fields = {name: value for name, value in form.items() if isinstance(value, str)}
    try:
        store.receive(upload_id, fields, await upload.read())
    except UploadRefused as error:
        # What S3 answers to a POST its policy refuses.
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(error)) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@media_router.get("/{key:path}", include_in_schema=False)
def serve(key: str) -> FileResponse:
    path = _local().locate(key)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
    return FileResponse(
        path,
        media_type=content_type_of(key),
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": CACHE_CONTROL},
    )
