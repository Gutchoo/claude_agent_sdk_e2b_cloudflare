"""
Cloudflare R2 Storage for session snapshots.
Handles upload/download of project archives for hydration/dehydration.
"""

import boto3
from botocore.config import Config
from typing import Optional
import os

from config import (
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
)


class R2Storage:
    """Manages session snapshots in Cloudflare R2."""

    def __init__(self):
        self.bucket = R2_BUCKET_NAME
        self.client = boto3.client(
            's3',
            endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name='auto',
            config=Config(signature_version='s3v4'),
        )

    def get_snapshot_key(self, session_id: str) -> str:
        """Generate the S3 key for a session's snapshot."""
        return f"snapshots/{session_id}.tar.gz"

    def snapshot_exists(self, session_id: str) -> bool:
        """Check if a snapshot exists for a session."""
        try:
            self.client.head_object(Bucket=self.bucket, Key=self.get_snapshot_key(session_id))
            return True
        except self.client.exceptions.ClientError:
            return False

    def get_upload_url(self, session_id: str, expires_in: int = 3600) -> str:
        """
        Generate a presigned URL for uploading a snapshot.
        Used by the sandbox to upload directly to R2.
        """
        return self.client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': self.bucket,
                'Key': self.get_snapshot_key(session_id),
                'ContentType': 'application/gzip',
            },
            ExpiresIn=expires_in,
        )

    def get_download_url(self, session_id: str, expires_in: int = 3600) -> str:
        """
        Generate a presigned URL for downloading a snapshot.
        Used by the sandbox to download from R2.
        """
        return self.client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': self.bucket,
                'Key': self.get_snapshot_key(session_id),
            },
            ExpiresIn=expires_in,
        )

    def upload_snapshot(self, session_id: str, data: bytes) -> bool:
        """
        Upload a snapshot directly (for small files or testing).
        For large files, use presigned URLs instead.
        """
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=self.get_snapshot_key(session_id),
                Body=data,
                ContentType='application/gzip',
            )
            print(f"Uploaded snapshot for session {session_id}")
            return True
        except Exception as e:
            print(f"Failed to upload snapshot: {e}")
            return False

    def download_snapshot(self, session_id: str) -> Optional[bytes]:
        """
        Download a snapshot directly (for small files or testing).
        For large files, use presigned URLs instead.
        """
        try:
            response = self.client.get_object(
                Bucket=self.bucket,
                Key=self.get_snapshot_key(session_id),
            )
            data = response['Body'].read()
            print(f"Downloaded snapshot for session {session_id} ({len(data)} bytes)")
            return data
        except self.client.exceptions.NoSuchKey:
            print(f"No snapshot found for session {session_id}")
            return None
        except Exception as e:
            print(f"Failed to download snapshot: {e}")
            return None

    def delete_snapshot(self, session_id: str) -> bool:
        """Delete a snapshot for a session."""
        try:
            self.client.delete_object(
                Bucket=self.bucket,
                Key=self.get_snapshot_key(session_id),
            )
            print(f"Deleted snapshot for session {session_id}")
            return True
        except Exception as e:
            print(f"Failed to delete snapshot: {e}")
            return False

    def list_snapshots(self, limit: int = 100) -> list[dict]:
        """List all snapshots in the bucket."""
        try:
            response = self.client.list_objects_v2(
                Bucket=self.bucket,
                Prefix='snapshots/',
                MaxKeys=limit,
            )
            snapshots = []
            for obj in response.get('Contents', []):
                key = obj['Key']
                # Extract session_id from key
                session_id = key.replace('snapshots/', '').replace('.tar.gz', '')
                snapshots.append({
                    'session_id': session_id,
                    'key': key,
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'].isoformat(),
                })
            return snapshots
        except Exception as e:
            print(f"Failed to list snapshots: {e}")
            return []

    # File upload/download methods

    def get_file_key(self, session_id: str, file_id: str, filename: str) -> str:
        """Generate the S3 key for a session file."""
        return f"files/{session_id}/{file_id}/{filename}"

    def get_file_upload_url(
        self,
        session_id: str,
        file_id: str,
        filename: str,
        content_type: str,
        expires_in: int = 3600
    ) -> str:
        """Generate a presigned URL for uploading a file."""
        return self.client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': self.bucket,
                'Key': self.get_file_key(session_id, file_id, filename),
                'ContentType': content_type,
            },
            ExpiresIn=expires_in,
        )

    def get_file_download_url(
        self,
        session_id: str,
        file_id: str,
        filename: str,
        expires_in: int = 3600
    ) -> str:
        """Generate a presigned URL for downloading a file."""
        return self.client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': self.bucket,
                'Key': self.get_file_key(session_id, file_id, filename),
            },
            ExpiresIn=expires_in,
        )

    def file_exists(self, session_id: str, file_id: str, filename: str) -> bool:
        """Check if a file exists in R2."""
        try:
            self.client.head_object(
                Bucket=self.bucket,
                Key=self.get_file_key(session_id, file_id, filename)
            )
            return True
        except self.client.exceptions.ClientError:
            return False

    def delete_file(self, session_id: str, file_id: str, filename: str) -> bool:
        """Delete a single file from R2."""
        try:
            self.client.delete_object(
                Bucket=self.bucket,
                Key=self.get_file_key(session_id, file_id, filename),
            )
            print(f"Deleted file {filename} for session {session_id}")
            return True
        except Exception as e:
            print(f"Failed to delete file: {e}")
            return False

    def delete_session_files(self, session_id: str) -> int:
        """Delete all files for a session. Returns count of deleted files."""
        try:
            # List all files for this session
            response = self.client.list_objects_v2(
                Bucket=self.bucket,
                Prefix=f'files/{session_id}/',
            )

            objects = response.get('Contents', [])
            if not objects:
                return 0

            # Delete all files
            delete_objects = [{'Key': obj['Key']} for obj in objects]
            self.client.delete_objects(
                Bucket=self.bucket,
                Delete={'Objects': delete_objects}
            )
            print(f"Deleted {len(delete_objects)} files for session {session_id}")
            return len(delete_objects)
        except Exception as e:
            print(f"Failed to delete session files: {e}")
            return 0

    def list_session_files(self, session_id: str) -> list[dict]:
        """List all files for a session in R2."""
        try:
            response = self.client.list_objects_v2(
                Bucket=self.bucket,
                Prefix=f'files/{session_id}/',
            )
            files = []
            for obj in response.get('Contents', []):
                files.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'].isoformat(),
                })
            return files
        except Exception as e:
            print(f"Failed to list session files: {e}")
            return []
