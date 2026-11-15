# API cache

Snapshots written by `python scripts/cache_api.py` (or `python tasks.py demo`). The web app reads them only when the API is slow or down, and shows a "dados em cache" notice. The JSON files are gitignored because they are large (about 30 MB).
