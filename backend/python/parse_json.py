import sys
import json

def extract_text_from_json(json_path):
    """Extract text from JSON file"""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        def flatten_json(obj, prefix=''):
            """Recursively flatten JSON to text"""
            lines = []
            
            if isinstance(obj, dict):
                for key, value in obj.items():
                    full_key = f"{prefix}.{key}" if prefix else key
                    if isinstance(value, (dict, list)):
                        lines.extend(flatten_json(value, full_key))
                    else:
                        lines.append(f"{full_key}: {value}")
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    lines.extend(flatten_json(item, f"{prefix}[{i}]"))
            else:
                lines.append(str(obj))
            
            return lines
        
        text_lines = flatten_json(data)
        return "\n".join(text_lines).strip()
    except Exception as e:
        return f"Error reading JSON: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_json.py <path_to_json>")
        sys.exit(1)
    
    json_path = sys.argv[1]
    text = extract_text_from_json(json_path)
    print(text)
