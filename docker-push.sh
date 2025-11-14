#!/bin/bash

DOCKER_USERNAME=${DOCKER_USERNAME:-"avisantoso"}
IMAGE_NAME=${IMAGE_NAME:-"plunk"}
VERSION=${VERSION:-"latest"}

docker build -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} .

docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}