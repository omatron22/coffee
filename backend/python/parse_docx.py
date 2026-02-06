import sys
from docx import Document

def extract_text_from_docx(docx_path):
    """Extract text from DOCX file"""
    try:
        doc = Document(docx_path)
        text = []
        
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                text.append(paragraph.text)
        
        return "\n".join(text).strip()
    except Exception as e:
        return f"Error reading DOCX: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_docx.py <path_to_docx>")
        sys.exit(1)
    
    docx_path = sys.argv[1]
    text = extract_text_from_docx(docx_path)
    print(text)
