/**
 * Babylon 9.12's internal pipeline/shadow imports use .pure modules. Their
 * classes alone do not install these Effect texture-binding methods: without
 * the wrappers they remain silent side-effect stubs, producing black bloom
 * merges and incorrect PCF shadows instead of throwing an error.
 */
import '@babylonjs/core/PostProcesses/postProcess';
import '@babylonjs/core/Materials/Textures/renderTargetTexture';
