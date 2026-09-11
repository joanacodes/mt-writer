-- Run once: corrected cache prices for Fable (read 10%, write 125% of input).
update docs set content = replace(content, '"cache_read": 0.25, "cache_write": 12.5', '"cache_read": 1, "cache_write": 12.5') where name = 'prices';
