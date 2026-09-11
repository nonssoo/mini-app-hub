---
name: transformation
description: Use when asked to convert data from one format or structure to another — e.g. unstructured notes to JSON, messy CSV to clean table, one file format to another. Triggers on words like "convert", "transform", "reformat", "restructure".
---

# Transformation Skill

## When to use this skill
Use this skill whenever the task is converting data from one shape or format 
into another, while preserving the underlying information.

## Steps to follow
1. Identify the source format and the target format explicitly
2. Map each field/element in the source to its corresponding place in the 
   target structure
3. Handle missing or malformed source data explicitly (skip, default, 
   or flag — don't silently drop it)
4. Validate the output actually conforms to the target format 
   (e.g. valid JSON, correct CSV columns)
5. Preserve all original information unless explicitly asked to filter it

## Example
**Input:** Messy CSV with inconsistent date formats  
**Output:** Clean CSV with all dates normalized to YYYY-MM-DD, with a note 
on any rows that couldn't be parsed

## Best practices
- Never silently drop or alter data without flagging it
- State the mapping/logic used, so the transformation is auditable
- When format is ambiguous, ask or state the assumed target schema