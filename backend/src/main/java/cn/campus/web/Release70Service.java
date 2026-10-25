package cn.campus.web;

import cn.campus.admin.OwnerAccountService;
import cn.campus.ai.knowledge.ModelSettingsService;
import cn.campus.content.SeasonTopicService;
import cn.campus.point.PhotographyPlanService;
import cn.campus.settings.InteractionFeatures;
import org.springframework.stereotype.Service;

/** Small service registry; business logic stays in its own package. */
@Service
public record Release70Service(
    OwnerAccountService owner,
    ModelSettingsService model,
    SeasonTopicService topics,
    PhotographyPlanService plans,
    InteractionFeatures features,
    cn.campus.point.ScoutQuizService quiz,
    cn.campus.admin.RecordMaintenanceService records,
    cn.campus.notification.MessagingService messaging,
    cn.campus.point.PersonalWorkflowService workflow,
    cn.campus.point.CampusGuideService guides,
    cn.campus.point.CampusWeatherService weather,
    cn.campus.point.MemoryAlbumService memories,
    cn.campus.admin.PublishingPreflightService preflight) {
  public boolean handle(ApiContext c) throws Exception {
    return cn.campus.settings.Celebrations.handle(c)
        || cn.campus.ai.knowledge.SupportPolicy.handleAdmin(c)
        || cn.campus.content.ReleaseUpdates.handle(c)
        || guides.handle(c)
        || weather.handleAdmin(c)
        || memories.handle(c)
        || preflight.handle(c)
        || workflow.handle(c)
        || messaging.handle(c)
        || quiz.handle(c)
        || records.handle(c)
        || features.handle(c)
        || owner.handle(c)
        || model.handle(c)
        || topics.handle(c)
        || plans.handle(c);
  }
}
