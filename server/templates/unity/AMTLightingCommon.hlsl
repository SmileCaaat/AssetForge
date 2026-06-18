#ifndef AMT_LIGHTING_COMMON_INCLUDED
#define AMT_LIGHTING_COMMON_INCLUDED

#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

// 片元内采样 URP 主光阴影贴图（Cascade / Screen / 普通主光阴影均走 GetShadowCoord）
half AMT_SampleMainLightShadowAttenuation(float4 positionCS, float3 positionWS)
{
#if defined(MAIN_LIGHT_CALCULATE_SHADOWS) && !defined(_RECEIVE_SHADOWS_OFF)
    VertexPositionInputs posInputs = (VertexPositionInputs)0;
    posInputs.positionCS = positionCS;
    posInputs.positionWS = positionWS;
    float4 shadowCoord = GetShadowCoord(posInputs);
    return MainLightRealtimeShadow(shadowCoord);
#else
    return 1.0;
#endif
}

#endif
