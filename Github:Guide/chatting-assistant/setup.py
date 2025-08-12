from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="onlyfans-ai-chatbot",
    version="1.0.0",
    author="OF AI Assistant",
    author_email="contact@ofaiassistant.com",
    description="AI-powered messaging assistant for OnlyFans creators",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/onlyfans-ai-chatbot",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "spacy>=3.7.0",
        "textblob>=0.17.1",
        "nltk>=3.8",
        "pandas>=2.0.0",
        "numpy>=1.24.0",
        "scikit-learn>=1.3.0",
        "python-dotenv>=1.0.0",
        "colorama>=0.4.6",
    ],
    entry_points={
        "console_scripts": [
            "of-chatbot=main:main",
        ],
    },
    include_package_data=True,
    package_data={
        "": ["config.json", "example_fans.json"],
    },
)