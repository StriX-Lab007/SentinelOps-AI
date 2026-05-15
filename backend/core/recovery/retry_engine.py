import time
import logging
from typing import Callable, Any

logger = logging.getLogger("sentinelops.recovery.retry_engine")

class RetryEngine:
    """Executes callables with configurable exponential backoff limits."""
    
    @staticmethod
    def execute_with_retry(
        func: Callable[..., Any], 
        max_retries: int, 
        base_delay: float, 
        *args, 
        **kwargs
    ) -> Any:
        retries = 0
        last_exception = None
        
        while retries < max_retries:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                delay = base_delay * (2 ** retries)
                logger.warning(f"[RetryEngine] Execution failed. Retrying in {delay}s (Attempt {retries+1}/{max_retries}). Error: {e}")
                time.sleep(delay)
                retries += 1
                
        logger.error(f"[RetryEngine] Exhausted all {max_retries} retries.")
        raise last_exception
