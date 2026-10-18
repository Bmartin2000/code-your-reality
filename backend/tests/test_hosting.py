"""Separate frontend/API hosts: ETag."""


def test_unchanged_polls_get_304(client):
    first = client.get("/api/projects")
    tag = first.headers["etag"]
    assert first.headers["cache-control"] == "private, no-cache"
    again = client.get("/api/projects", headers={"If-None-Match": tag})
    assert again.status_code == 304 and again.content == b""
    client.post("/api/projects/sample")
    assert client.get("/api/projects", headers={"If-None-Match": tag}).status_code == 200  # changed: new body
    assert "etag" not in client.get("/health").headers  # only API JSON
