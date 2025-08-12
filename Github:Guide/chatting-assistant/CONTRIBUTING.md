# Contributing to OnlyFans AI Chatting Assistant

Thank you for your interest in contributing to this project! We welcome contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/onlyfans-ai-chatbot.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Run tests: `python -m pytest`
6. Commit your changes: `git commit -m "Add your feature"`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Create a Pull Request

## Development Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# Install development dependencies
pip install pytest flake8 black
```

## Code Style

- Follow PEP 8 guidelines
- Use Black for code formatting: `black .`
- Run flake8 for linting: `flake8 .`

## Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Maintain or improve code coverage

## Pull Request Guidelines

1. Update README.md with details of changes if needed
2. Update the requirements.txt if you add dependencies
3. The PR should work for Python 3.8+
4. Include meaningful commit messages

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Report unacceptable behavior to project maintainers

## Questions?

Feel free to open an issue for any questions or concerns.