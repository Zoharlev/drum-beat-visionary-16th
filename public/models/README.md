# Local Models Directory

This directory is for storing locally downloaded pre-trained models to improve loading performance and enable offline usage.

## Downloading Models

To download models locally, run these commands in your terminal from the project root:

### Wav2Vec2 Audio Classification Model
```bash
cd public/models
git clone https://huggingface.co/onnx-community/wav2vec2-base-960h
```

### YAMNet Model
```bash
cd public/models  
git clone https://huggingface.co/onnx-community/yamnet
```

## Directory Structure

After downloading, your models directory should look like:

```
public/models/
├── README.md
├── wav2vec2-base-960h/
│   ├── model.onnx
│   ├── config.json
│   └── other model files...
└── yamnet/
    ├── model.onnx
    ├── config.json
    └── other model files...
```

## Benefits of Local Models

- **Faster Loading**: No network download required
- **Offline Usage**: Works without internet connection
- **Reduced Bandwidth**: No repeated downloads
- **Improved Performance**: Local file access is faster than remote

## Fallback Behavior

The application will automatically:
1. Check for local models first
2. Validate model files exist and are complete
3. Fall back to remote models if local ones are missing or invalid
4. Try CPU if WebGPU fails for either local or remote models

## Model Validation

The app checks for these required files:
- `model.onnx` - The main model file
- `config.json` - Model configuration

If any required files are missing, the app will use remote models instead.