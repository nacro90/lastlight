/**
 * Post-processing zinciri.
 *
 * Tampon tipi acikca yarim float: LDR tamponda sahne tone mapping'e gelmeden
 * once 1.0'da kirpilir ve tone mapping yapacak bir sey kalmaz.
 *
 * Bloom esigi bilincli olarak 1.0'in ustunde. Daha alcakta tutmak butun
 * gokyuzunu bloom'a sokup ekrani sutbeyaz bir haleyle kapliyor; tek bloom
 * kaynagi gunes diski ve camdaki yansima olmali.
 *
 * Bloom mipmap tabanli, yani bulaniklik zaten dusuk cozunurlukte hesaplaniyor.
 * Tone mapping zincirin sonunda ve tek yerde: iki kez uygulanirsa goruntu
 * yikaniyor.
 */

import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'

export function Effects(): React.ReactElement {
  return (
    <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
      <Bloom intensity={0.62} luminanceThreshold={1.05} luminanceSmoothing={0.22} mipmapBlur />
      <Vignette offset={0.24} darkness={0.55} />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  )
}
