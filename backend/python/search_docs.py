import sys
import json
from vector_store import search_documents

def deduplicate_results(results, limit):
    """Keep only the best match per file"""
    seen = {}
    for result in results:
        file_path = result['file_path']
        if file_path not in seen or result['_distance'] < seen[file_path]['_distance']:
            seen[file_path] = result
    
    # Sort by distance and return up to limit
    deduplicated = sorted(seen.values(), key=lambda x: x['_distance'])
    return deduplicated[:limit]

if __name__ == "__main__":
    query = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    # Get more results to ensure we have enough after deduplication
    results = search_documents(query, limit * 3)
    deduplicated = deduplicate_results(results, limit)
    print(json.dumps(deduplicated))
