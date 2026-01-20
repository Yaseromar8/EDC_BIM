// 4. APPLY PLACEMENT TRANSFORMATIONS (Scale, Height, Rotation)
useEffect(() => {
    if (!viewerRef.current || !viewerRef.current.model) return;

    const viewer = viewerRef.current;
    const instanceTree = viewer.model.getInstanceTree();
    if (!instanceTree) return;

    // Get root node ID
    const rootId = instanceTree.getRootId();

    // Create transformation matrix
    const matrix = new THREE.Matrix4();

    // Apply transformations in order: Scale -> Rotate -> Translate
    matrix.makeScale(modelScale, modelScale, modelScale);

    // Rotate around Y axis (vertical)
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationY(THREE.MathUtils.degToRad(modelRotationY));
    matrix.multiply(rotationMatrix);

    // Translate height (move up/down)
    const translationMatrix = new THREE.Matrix4();
    translationMatrix.makeTranslation(0, modelHeight, 0);
    matrix.multiply(translationMatrix);

    // Apply to all loaded models
    viewer.impl.modelQueue().getModels().forEach(model => {
        const fragList = model.getFragmentList();
        if (fragList) {
            // Apply matrix to all fragments
            for (let fragId = 0; fragId < fragList.fragments.length; fragId++) {
                fragList.updateAnimTransform(fragId, null, null, matrix);
            }
        }
    });

    viewer.impl.invalidate(true, true, false);
}, [modelScale, modelHeight, modelRotationY]);
