# A minimal adapter image. Base it on whatever your agent needs; the only
# requirements are that the entrypoint follows the contract and that jq is
# available if you use the reference wrapper.
FROM alpine:3.22

RUN apk add --no-cache bash jq git

COPY agent.sh /agent/agent.sh
RUN chmod +x /agent/agent.sh

# Never bake credentials into the image. They are injected at run time.
ENTRYPOINT ["/agent/agent.sh"]
