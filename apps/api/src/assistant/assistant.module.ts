import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AssistantController } from './assistant.controller.js';

@Module({
  imports: [AiModule],
  controllers: [AssistantController],
})
export class AssistantModule {}
