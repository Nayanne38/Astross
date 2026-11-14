# Thin wrapper: all logic lives in tasks.py so Windows (no make) and Unix behave the same.
PY ?= python3
TARGETS := setup db-up sample etl etl-incremental train forecast api web test demo
.PHONY: $(TARGETS)
$(TARGETS):
	$(PY) tasks.py $@
