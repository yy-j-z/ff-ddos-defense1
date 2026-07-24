FROM openresty/openresty:alpine

# lua-resty-limit-req ships with the openresty bundle.
RUN mkdir -p /var/log /usr/local/openresty/nginx/lua \
    && touch /var/log/defender.log \
    && chmod 666 /var/log/defender.log

COPY nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY rules.lua  /usr/local/openresty/nginx/lua/rules.lua

EXPOSE 8080

CMD ["openresty", "-g", "daemon off;"]
