"""
The hosted media store: two buckets (LIVE_EDITING_PHASE_4.md § 5, P4-A).

- **`UploadsBucket`** (`slackdata-uploads-<stage>-*`), private, a 90-day
  quarantine. The browser posts each file here through a presigned POST, whose
  policy makes S3 itself refuse a file over the limit or of another type — a
  presigned PUT could not (P4-A).
- **`MediaBucket`** (`slackdata-media-<stage>-*`), private, versioned, read
  only by CloudFront at `/media/*` (D48).

What the Lambda role may do here is exactly what this needs and no more:
`s3:GetObject` and `s3:PutObject` on the uploads bucket (Tier 3), and
`s3:PutObject` on the media bucket (request #6). A copy between them is
authorised by those two, so publishing never routes the file through the
Lambda. No `s3:DeleteObject` anywhere (hazard 4), and no read on the media
bucket: `exists` is for the migration, which runs as the operator.

boto3 is imported lazily, as in every other hosted store.
"""

from slack_data.media.kinds import FileType
from slack_data.media.store import (
    CACHE_CONTROL,
    UPLOAD_TTL_SECONDS,
    UploadTarget,
    _expiry,
    disposition,
)

# Uploads from the edit panel sit under one prefix of the quarantine bucket.
UPLOAD_PREFIX = "edit/"


class S3MediaStore:
    def __init__(self, media_bucket: str, uploads_bucket: str, client=None) -> None:
        self.media_bucket = media_bucket
        self.uploads_bucket = uploads_bucket
        self._client = client

    @property
    def client(self):
        if self._client is None:
            import boto3

            self._client = boto3.client("s3")
        return self._client

    def upload_target(self, upload_id: str, content_type: str, max_bytes: int, base_url: str) -> UploadTarget:
        key = UPLOAD_PREFIX + upload_id
        post = self.client.generate_presigned_post(
            Bucket=self.uploads_bucket,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, max_bytes],
            ],
            ExpiresIn=UPLOAD_TTL_SECONDS,
        )
        _, expires_at = _expiry()
        return UploadTarget(upload=upload_id, url=post["url"], fields=post["fields"], expires_at=expires_at)

    def upload_head(self, upload_id: str, n: int) -> tuple[bytes, int] | None:
        from botocore.exceptions import ClientError

        try:
            response = self.client.get_object(
                Bucket=self.uploads_bucket, Key=UPLOAD_PREFIX + upload_id, Range=f"bytes=0-{n - 1}"
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "InvalidRange"):
                return None
            raise
        head = response["Body"].read()
        # "bytes 0-15/123456": the size of the whole object.
        content_range = response.get("ContentRange") or ""
        size = int(content_range.rsplit("/", 1)[-1]) if "/" in content_range else len(head)
        return head, size

    def _headers(self, kind: FileType, download_name: str | None) -> dict:
        headers = {"ContentType": kind.content_type, "CacheControl": CACHE_CONTROL}
        if disposition(download_name):
            headers["ContentDisposition"] = disposition(download_name)
        return headers

    def publish(self, upload_id: str, key: str, kind: FileType, download_name: str | None = None) -> None:
        self.client.copy_object(
            Bucket=self.media_bucket,
            Key=key,
            CopySource={"Bucket": self.uploads_bucket, "Key": UPLOAD_PREFIX + upload_id},
            # Not the browser's claim: the type the bytes were checked to be.
            MetadataDirective="REPLACE",
            ServerSideEncryption="AES256",
            **self._headers(kind, download_name),
        )

    def put(self, key: str, data: bytes, kind: FileType, download_name: str | None = None) -> None:
        self.client.put_object(
            Bucket=self.media_bucket, Key=key, Body=data, ServerSideEncryption="AES256",
            **self._headers(kind, download_name),
        )

    def put_as(self, key: str, data: bytes, content_type: str) -> None:
        """A file whose type no upload may have (the two SVG logos, migrated
        as they were). The migration's only."""
        self.client.put_object(
            Bucket=self.media_bucket, Key=key, Body=data, ServerSideEncryption="AES256",
            ContentType=content_type, CacheControl=CACHE_CONTROL,
        )

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self.media_bucket, Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise
        return True

    def held_keys(self) -> set[str]:
        keys = set()
        for page in self.client.get_paginator("list_objects_v2").paginate(Bucket=self.media_bucket):
            keys |= {item["Key"] for item in page.get("Contents", [])}
        return keys
