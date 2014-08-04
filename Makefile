# Recommend you run `npm test` instead as it'll handle dependencies.

MOCHA := ./node_modules/mocha/bin/mocha

all: check

check:
	@@for file in $(shell find ./tests -name "*Test.js"); do ${MOCHA} $$file; done
