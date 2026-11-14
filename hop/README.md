# Apache Hop project (Phase 2)
Workflows here call the standalone Python steps (`python -m etl.pipelines.run ...`) in order:
extract → transform → load → data-quality → ML refresh. The Python pipeline never depends on Hop.
