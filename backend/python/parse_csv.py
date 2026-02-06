import sys
import csv

def extract_text_from_csv(csv_path):
    """Extract text from CSV file"""
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            rows = []
            
            for row in reader:
                rows.append(" | ".join(row))
            
            return "\n".join(rows).strip()
    except Exception as e:
        return f"Error reading CSV: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_csv.py <path_to_csv>")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    text = extract_text_from_csv(csv_path)
    print(text)
