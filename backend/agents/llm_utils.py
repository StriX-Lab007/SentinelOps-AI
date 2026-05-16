"""Shared LLM factory for specialist agents."""
from __future__ import annotations

import os
from typing import Optional, Any


def get_llm(json_mode: bool = False) -> Optional[Any]:
    google_key = os.getenv("GOOGLE_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    # PRIORITIZE GROQ (More stable on this environment)
    if groq_key:
        from langchain_groq import ChatGroq
        kwargs = {"model": "llama-3.3-70b-versatile", "groq_api_key": groq_key, "temperature": 0.0, "max_retries": 3}
        if json_mode:
            kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatGroq(**kwargs)
        
    if google_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model="gemini-1.5-flash-latest", google_api_key=google_key, temperature=0.0, max_retries=3)

    if openai_key:
        from langchain_openai import ChatOpenAI
        kwargs = {"model": "gpt-4o-mini", "openai_api_key": openai_key, "temperature": 0.0, "max_retries": 3}
        if json_mode:
            kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatOpenAI(**kwargs)
    return None
