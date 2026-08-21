"""RTSP URL helpers for Intelbras cameras/DVRs/NVRs.

Intelbras IP cameras and recorders are Dahua OEM devices, so they speak the
same "cam/realmonitor" RTSP dialect regardless of model. This lets an
installer configure a camera with host/user/password/channel instead of
hand-assembling an RTSP URL on site, which is a common source of setup
mistakes (wrong path, unescaped special characters in the password, etc).
"""

from urllib.parse import quote


def build_intelbras_rtsp_url(
    host: str,
    username: str,
    password: str,
    port: int = 554,
    channel: int = 1,
    subtype: int = 0,
) -> str:
    """Build an RTSP URL for an Intelbras camera/DVR/NVR channel.

    subtype=0 is the mainstream (full resolution); subtype=1 is the
    substream (lower resolution, lighter on CPU/bandwidth for continuous
    detection). For a standalone IP camera (not behind a DVR/NVR),
    channel=1.
    """
    user = quote(username, safe="")
    pwd = quote(password, safe="")
    return (
        f"rtsp://{user}:{pwd}@{host}:{port}/cam/realmonitor"
        f"?channel={channel}&subtype={subtype}"
    )
