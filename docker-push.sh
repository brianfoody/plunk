#!/bin/bash

DOCKER_USERNAME=${DOCKER_USERNAME:-"avisantoso"}
IMAGE_NAME=${IMAGE_NAME:-"plunk"}
VERSION=${VERSION:-"latest"}

docker build --platform linux/amd64 -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} .

docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}